import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pinEnglish } from "./locale";

const START_URL = "https://watch.dropout.tv/browse";

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
    console.error(`[couch] failed to load ${url}: ${description} (${code})`);
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
            console.log(`[couch] screenshot: ${screenshotPath}`);
          }
        } catch (error) {
          console.error("[couch] screenshot failed", error);
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
    ipcMain.on("couch:quit", () => app.quit());

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
