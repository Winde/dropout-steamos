import { app, BrowserWindow, ipcMain, net, session, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC } from "../shared/ipc";
import { useSimpleInputMethod } from "./linux-env";
import { pinEnglish } from "./locale";
import {
  currentAppImage,
  RELEASES_PAGE,
  relaunchArgs,
  Updater,
} from "./updater";

// Before Chromium creates its input method and GTK loads a module by name:
// Steam's module types the on-screen keyboard's text twice in Game Mode.
useSimpleInputMethod(process.env);

const START_URL = "https://watch.dropout.tv/browse";

/** How long the closing overlay stays up before the window goes. */
export const CLOSING_OVERLAY_MS = 2000;

const isSteam =
  process.env.SteamOS === "1" && process.env.SteamGamepadUI === "1";
const wantsFullscreen = isSteam || process.argv.includes("--fullscreen");
const wantsDevtools = process.argv.includes("--devtools");
const wantsWindowed = process.argv.includes("--windowed");

const screenshotArg = process.argv.find((a) => a.startsWith("--screenshot="));
const screenshotPath = screenshotArg?.slice("--screenshot=".length);

if (isSteam) {
  // Gamescope + Electron needs this on SteamOS.
  app.commandLine.appendSwitch("no-sandbox");
}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("lang", "en-US");
app.commandLine.appendSwitch(
  "enable-features",
  [
    "AcceleratedVideoDecoder",
    "AcceleratedVideoDecodeLinuxGL",
    "AcceleratedVideoDecodeLinuxZeroCopyGL",
  ].join(","),
);

app.setName("Drop-In");

let win: BrowserWindow | null = null;

const updater = new Updater({
  currentVersion: () => app.getVersion(),
  appImage: () => currentAppImage(process.env),
  // Electron's net stack, like the rest of the app: it follows the system's
  // proxy settings where Node's own fetch would not.
  fetch: (url, init) => net.fetch(url, init),
});

/** The TV layer is the only caller that can reach these handlers. */
function assertTrusted(event: IpcMainInvokeEvent): void {
  if (event.sender !== win?.webContents) throw new Error("Untrusted sender");
}

function isAllowedNavigation(rawUrl: string): boolean {
  try {
    const { hostname, protocol } = new URL(rawUrl);
    if (protocol !== "https:") return false;
    return (
      hostname === "watch.dropout.tv" ||
      hostname.endsWith(".dropout.tv") ||
      hostname.endsWith(".vhx.tv") ||
      hostname === "auth.vhx.com" ||
      hostname.endsWith(".vhx.com")
    );
  } catch {
    return false;
  }
}

function openExternal(rawUrl: string): void {
  try {
    const { protocol } = new URL(rawUrl);
    if (protocol === "https:" || protocol === "http:") {
      void shell.openExternal(rawUrl);
    }
  } catch {
    // Ignore malformed links.
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen: wantsFullscreen,
    frame: !wantsFullscreen,
    backgroundColor: "#0b0b0b",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => {
    if (!wantsFullscreen && !wantsWindowed) win?.maximize();
    win?.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    if (code === -3) return; // aborted by a redirect
    console.error(`[dropin] failed to load ${url}: ${description} (${code})`);
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.control && input.key.toLowerCase() === "q") {
      event.preventDefault();
      app.quit();
    }
    if (input.key === "F11") {
      event.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    }
  });

  if (wantsDevtools) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  if (screenshotPath) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const image = await win?.webContents.capturePage();
          if (image) {
            fs.writeFileSync(screenshotPath, image.toPNG());
            console.log(`[dropin] screenshot: ${screenshotPath}`);
          }
        } catch (error) {
          console.error("[dropin] screenshot failed", error);
        } finally {
          app.quit();
        }
      }, 8000);
    });
  }

  void win.loadURL(START_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  void app.whenReady().then(async () => {
    ipcMain.on(IPC.quit, () => app.quit());

    ipcMain.handle(IPC.version, (event) => {
      assertTrusted(event);
      return app.getVersion();
    });

    // GitHub Releases is the update channel. The renderer never handles the
    // download: it asks, shows state, and the main process swaps the AppImage.
    ipcMain.handle(IPC.updateCheck, (event) => {
      assertTrusted(event);
      return updater.check();
    });

    ipcMain.handle(IPC.updateNotes, (event) => {
      assertTrusted(event);
      return updater.notes();
    });

    ipcMain.handle(IPC.updateInstall, async (event) => {
      assertTrusted(event);
      const appImage = await updater.install();
      // An AppImage runs an inner binary from its own read-only mount, so
      // process.execPath would be gone by the time the relaunch happens. Start
      // the file that was just replaced instead; Electron does that once this
      // instance has exited, which keeps the single-instance lock uncontended.
      app.relaunch({
        execPath: appImage,
        args: relaunchArgs(process.argv.slice(1)),
      });
      // The TV layer switches to its closing state as soon as this call
      // returns. Hold the window long enough to read it, then quit as before.
      setTimeout(() => app.quit(), CLOSING_OVERLAY_MS);
    });

    ipcMain.on(IPC.updatePage, (event) => {
      if (event.sender !== win?.webContents) return;
      void shell.openExternal(RELEASES_PAGE);
    });

    await pinEnglish();

    const chrome = process.versions.chrome ?? "140.0.0.0";
    session.defaultSession.setUserAgent(
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`,
    );

    const allowedPermissions = new Set<string>([
      "storage-access",
      "top-level-storage-access",
      "screen-wake-lock",
      "clipboard-sanitized-write",
    ]);

    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        if (permission === "fullscreen" || permission === "automatic-fullscreen") {
          // The player's own fullscreen button makes the cross-origin iframe
          // the fullscreen element, which hides our OSD (it lives outside the
          // iframe). Fullscreen the window instead: the watch page is already
          // an edge-to-edge TV layout.
          win?.setFullScreen(true);
          callback(false);
          return;
        }
        callback(allowedPermissions.has(permission));
      },
    );

    createWindow();
  });
}
