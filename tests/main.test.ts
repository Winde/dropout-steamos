import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const windows: FakeWindow[] = [];
  const appHandlers = new Map<string, (...args: any[]) => void>();
  const ipcHandlers = new Map<string, (...args: any[]) => void>();

  interface FakeContents {
    handlers: Map<string, (...args: any[]) => void>;
    onceHandlers: Map<string, (...args: any[]) => void>;
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    openDevTools: ReturnType<typeof vi.fn>;
    capturePage: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
  }

  class FakeWindow {
    static getAllWindows = () => windows;
    options: Record<string, unknown>;
    webContents: FakeContents;
    handlers = new Map<string, (...args: any[]) => void>();
    fullscreen: boolean;
    minimized = false;
    setMenuBarVisibility = vi.fn();
    show = vi.fn();
    maximize = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = vi.fn(() => this.minimized);
    isFullScreen = vi.fn(() => this.fullscreen);
    setFullScreen = vi.fn((value: boolean) => {
      this.fullscreen = value;
    });
    loadURL = vi.fn();
    once = vi.fn((event: string, handler: (...args: any[]) => void) => {
      this.handlers.set(event, handler);
    });
    on = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.fullscreen = Boolean(options.fullscreen);

      const handlers = new Map<string, (...args: any[]) => void>();
      const onceHandlers = new Map<string, (...args: any[]) => void>();
      const contents = {
        handlers,
        onceHandlers,
        setWindowOpenHandler: vi.fn(),
        openDevTools: vi.fn(),
        capturePage: vi.fn(),
        loadURL: vi.fn(),
      } as unknown as FakeContents;
      contents.on = vi.fn(
        (event: string, handler: (...args: any[]) => void) => {
          handlers.set(event, handler);
          return contents;
        },
      );
      contents.once = vi.fn(
        (event: string, handler: (...args: any[]) => void) => {
          onceHandlers.set(event, handler);
          return contents;
        },
      );

      this.webContents = contents;
      windows.push(this);
    }
  }

  const app = {
    commandLine: { appendSwitch: vi.fn() },
    setName: vi.fn(),
    getVersion: vi.fn(() => "0.1.0"),
    relaunch: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      appHandlers.set(event, handler);
    }),
    whenReady: vi.fn(() => Promise.resolve()),
  };

  const ipcMain = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      ipcHandlers.set(event, handler);
    }),
    handle: vi.fn((event: string, handler: (...args: any[]) => void) => {
      ipcHandlers.set(event, handler);
    }),
  };

  const session = {
    defaultSession: {
      setUserAgent: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
    },
  };

  const shell = { openExternal: vi.fn() };
  const net = { fetch: vi.fn() };

  return {
    app,
    appHandlers,
    BrowserWindow: FakeWindow,
    ipcHandlers,
    ipcMain,
    net,
    pinEnglish: vi.fn(),
    session,
    shell,
    windows,
  };
});

vi.mock("electron", () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  ipcMain: mocks.ipcMain,
  net: mocks.net,
  session: mocks.session,
  shell: mocks.shell,
}));

vi.mock("../src/main/locale", () => ({ pinEnglish: mocks.pinEnglish }));

const originalArgv = [...process.argv];
const steamEnv = ["SteamOS", "SteamGamepadUI"] as const;
const originalSteam = steamEnv.map((name) => process.env[name]);

type FakeWindow = InstanceType<typeof mocks.BrowserWindow>;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

async function loadMain(): Promise<void> {
  vi.resetModules();
  await import("../src/main/index");
  await flush();
}

function win(): FakeWindow {
  const window = mocks.windows[0];
  if (!window) throw new Error("no BrowserWindow was created");
  return window;
}

function contentHandler(event: string): (...args: any[]) => void {
  const handler = win().webContents.handlers.get(event);
  if (!handler) throw new Error(`no webContents handler for ${event}`);
  return handler;
}

function appHandler(event: string): (...args: any[]) => void {
  const handler = mocks.appHandlers.get(event);
  if (!handler) throw new Error(`no app handler for ${event}`);
  return handler;
}

function ipcHandler(event: string): (...args: any[]) => any {
  const handler = mocks.ipcHandlers.get(event);
  if (!handler) throw new Error(`no ipc handler for ${event}`);
  return handler;
}

function permissionHandler(): (
  contents: unknown,
  permission: string,
  callback: (allowed: boolean) => void,
) => void {
  const handler =
    mocks.session.defaultSession.setPermissionRequestHandler.mock.calls[0]?.[0];
  if (typeof handler !== "function") {
    throw new Error("no permission handler was registered");
  }
  return handler;
}

function useArgv(...args: string[]): void {
  process.argv = ["node", "electron", ".", ...args];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.windows.length = 0;
  mocks.appHandlers.clear();
  mocks.ipcHandlers.clear();
  mocks.app.requestSingleInstanceLock.mockReturnValue(true);
  mocks.app.whenReady.mockResolvedValue(undefined);
  mocks.pinEnglish.mockResolvedValue(undefined);
  process.argv = ["node", "electron", "."];
  for (const name of steamEnv) delete process.env[name];
  (globalThis as unknown as Record<string, unknown>).__dirname =
    "D:/source/dropout-steamos/dist";
});

afterAll(() => {
  process.argv = originalArgv;
  steamEnv.forEach((name, index) => {
    const value = originalSteam[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
  Reflect.deleteProperty(globalThis, "__dirname");
});

describe("startup", () => {
  it("creates one window at the storefront with the TV defaults", async () => {
    await loadMain();

    expect(mocks.app.setName).toHaveBeenCalledWith("Drop-In");
    expect(mocks.app.whenReady).toHaveBeenCalledTimes(1);
    expect(mocks.pinEnglish).toHaveBeenCalledTimes(1);
    expect(mocks.windows).toHaveLength(1);

    const window = win();
    expect(window.options).toMatchObject({
      width: 1600,
      height: 900,
      fullscreen: false,
      frame: true,
      backgroundColor: "#0b0b0b",
      show: false,
      autoHideMenuBar: true,
    });
    expect(window.options.webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    });
    expect(String((window.options.webPreferences as Record<string, unknown>).preload))
      .toMatch(/preload\.cjs$/);
    expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(window.loadURL).toHaveBeenCalledWith(
      "https://watch.dropout.tv/browse",
    );
  });

  it("sets the Chromium switches and a browser user agent", async () => {
    await loadMain();

    const switches = mocks.app.commandLine.appendSwitch.mock.calls;
    expect(switches).toContainEqual(["autoplay-policy", "no-user-gesture-required"]);
    expect(switches).toContainEqual(["lang", "en-US"]);
    const features = switches.find(([name]) => name === "enable-features");
    expect(String(features?.[1])).toContain("AcceleratedVideoDecoder");

    const agent = mocks.session.defaultSession.setUserAgent.mock.calls[0]?.[0];
    expect(agent).toContain(`Chrome/${process.versions.chrome ?? "140.0.0.0"}`);
    expect(agent).not.toContain("Electron");
    expect(String(agent)).toMatch(/^Mozilla\/5\.0 \(X11; Linux x86_64\)/);
  });

  it("shows the window and maximizes it by default", async () => {
    await loadMain();
    const window = win();

    window.handlers.get("ready-to-show")?.();

    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("does not maximize a fullscreen window", async () => {
    useArgv("--fullscreen");
    await loadMain();
    const window = win();

    expect(window.options.fullscreen).toBe(true);
    expect(window.options.frame).toBe(false);
    window.handlers.get("ready-to-show")?.();
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("does not maximize a windowed window", async () => {
    useArgv("--windowed");
    await loadMain();
    const window = win();

    window.handlers.get("ready-to-show")?.();
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("opens devtools on request", async () => {
    useArgv("--devtools");
    await loadMain();

    expect(win().webContents.openDevTools).toHaveBeenCalledWith({
      mode: "detach",
    });
  });

  it("turns on fullscreen and no-sandbox on SteamOS", async () => {
    process.env.SteamOS = "1";
    process.env.SteamGamepadUI = "1";
    await loadMain();

    expect(win().options.fullscreen).toBe(true);
    expect(mocks.app.commandLine.appendSwitch).toHaveBeenCalledWith(
      "no-sandbox",
    );
  });

  it("quits when another instance owns the app", async () => {
    mocks.app.requestSingleInstanceLock.mockReturnValue(false);
    await loadMain();

    expect(mocks.app.quit).toHaveBeenCalledTimes(1);
    expect(mocks.windows).toHaveLength(0);
    expect(mocks.app.whenReady).not.toHaveBeenCalled();
  });

  it("wires the quit IPC channel", async () => {
    await loadMain();
    const quit = mocks.ipcHandlers.get("dropin:quit");
    expect(quit).toBeTypeOf("function");

    quit?.();
    expect(mocks.app.quit).toHaveBeenCalledTimes(1);
  });
});

describe("updates", () => {
  function trusted(): { sender: unknown } {
    return { sender: win().webContents };
  }

  function release(version: string): unknown {
    const base = `https://github.com/Winde/dropout-steamos/releases/download/v${version}`;
    return {
      tag_name: `v${version}`,
      assets: [
        {
          name: `Drop-In-${version}-x86_64.AppImage`,
          browser_download_url: `${base}/Drop-In-${version}-x86_64.AppImage`,
        },
        {
          name: "SHA256SUMS.txt",
          browser_download_url: `${base}/SHA256SUMS.txt`,
        },
      ],
    };
  }

  it("reports the running version to the TV layer", async () => {
    await loadMain();

    expect(ipcHandler("dropin:version")(trusted())).toBe("0.1.0");
  });

  it("refuses update requests from another sender", async () => {
    await loadMain();
    const stranger = { sender: {} };

    expect(() => ipcHandler("dropin:version")(stranger)).toThrow(
      "Untrusted sender",
    );
    expect(() => ipcHandler("dropin:update-check")(stranger)).toThrow(
      "Untrusted sender",
    );
    expect(() => ipcHandler("dropin:update-notes")(stranger)).toThrow(
      "Untrusted sender",
    );
    await expect(
      ipcHandler("dropin:update-install")(stranger),
    ).rejects.toThrow("Untrusted sender");
  });

  it("checks the latest GitHub release through Electron's net stack", async () => {
    await loadMain();
    mocks.net.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => release("0.1.0"),
      text: async () => "",
      body: null,
    });

    const info = await ipcHandler("dropin:update-check")(trusted());

    expect(info).toEqual({
      current: "0.1.0",
      latest: "0.1.0",
      available: false,
      canInstall: false,
    });
    expect(mocks.net.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/Winde/dropout-steamos/releases/latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/vnd.github+json",
        }),
      }),
    );
  });

  it("opens the releases page in the system browser", async () => {
    await loadMain();

    ipcHandler("dropin:update-page")(trusted());

    expect(mocks.shell.openExternal).toHaveBeenCalledWith(
      "https://github.com/Winde/dropout-steamos/releases",
    );
  });
});

describe("window lifecycle", () => {
  it("focuses the existing window on a second launch", async () => {
    await loadMain();
    const window = win();

    appHandler("second-instance")();

    expect(window.focus).toHaveBeenCalledTimes(1);
    expect(window.restore).not.toHaveBeenCalled();
  });

  it("restores a minimized window on a second launch", async () => {
    await loadMain();
    const window = win();
    window.minimized = true;

    appHandler("second-instance")();

    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it("quits when all windows close on this platform", async () => {
    await loadMain();

    appHandler("window-all-closed")();

    expect(mocks.app.quit).toHaveBeenCalledTimes(1);
  });

  it("creates a window on activate when none are open", async () => {
    await loadMain();
    mocks.windows.length = 0;

    appHandler("activate")();

    expect(mocks.windows).toHaveLength(1);
  });
});

describe("navigation policy", () => {
  it("allows storefront, player, and auth hosts over https", async () => {
    await loadMain();
    const navigate = contentHandler("will-navigate");

    for (const url of [
      "https://watch.dropout.tv/browse",
      "https://www.dropout.tv/show",
      "https://embed.vhx.tv/videos/1",
      "https://auth.vhx.com/login",
      "https://player.vhx.com/embed",
    ]) {
      const event = { preventDefault: vi.fn() };
      navigate(event, url);
      expect(event.preventDefault, url).not.toHaveBeenCalled();
    }
    expect(mocks.shell.openExternal).not.toHaveBeenCalled();
  });

  it("sends external navigation to the system browser", async () => {
    await loadMain();
    const navigate = contentHandler("will-navigate");

    for (const url of [
      "http://watch.dropout.tv/browse",
      "https://example.com",
      "https://dropout.tv.evil.com",
      "not a url",
    ]) {
      const event = { preventDefault: vi.fn() };
      navigate(event, url);
      expect(event.preventDefault, url).toHaveBeenCalledTimes(1);
    }

    // Only well-formed http(s) links reach the browser.
    expect(mocks.shell.openExternal).toHaveBeenCalledWith(
      "https://example.com",
    );
    expect(mocks.shell.openExternal).toHaveBeenCalledWith(
      "https://dropout.tv.evil.com",
    );
    expect(mocks.shell.openExternal).not.toHaveBeenCalledWith(
      "not a url",
    );
  });

  it("denies popup windows and opens them externally", async () => {
    await loadMain();
    const handler =
      win().webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    expect(handler).toBeTypeOf("function");

    expect(handler!({ url: "https://example.com/popup" })).toEqual({
      action: "deny",
    });
    expect(mocks.shell.openExternal).toHaveBeenCalledWith(
      "https://example.com/popup",
    );
  });

  it("ignores non-http popups", async () => {
    await loadMain();
    const handler =
      win().webContents.setWindowOpenHandler.mock.calls[0]?.[0];

    handler!({ url: "mailto:someone@example.com" });

    expect(mocks.shell.openExternal).toHaveBeenCalledTimes(0);
  });
});

describe("permissions", () => {
  it("fullscreens the window instead of the player iframe", async () => {
    await loadMain();
    const window = win();
    const handler = permissionHandler();

    for (const permission of ["fullscreen", "automatic-fullscreen"]) {
      const callback = vi.fn();
      handler(null, permission, callback);
      expect(callback).toHaveBeenCalledWith(false);
    }

    expect(window.setFullScreen).toHaveBeenCalledWith(true);
    expect(window.setFullScreen).toHaveBeenCalledTimes(2);
  });

  it("allows storage, wake lock, and clipboard writes", async () => {
    await loadMain();
    const handler = permissionHandler();

    for (const permission of [
      "storage-access",
      "top-level-storage-access",
      "screen-wake-lock",
      "clipboard-sanitized-write",
    ]) {
      const callback = vi.fn();
      handler(null, permission, callback);
      expect(callback, permission).toHaveBeenCalledWith(true);
    }
  });

  it("denies everything else", async () => {
    await loadMain();
    const callback = vi.fn();

    permissionHandler()(null, "geolocation", callback);

    expect(callback).toHaveBeenCalledWith(false);
  });
});

describe("keyboard shortcuts", () => {
  function input(input: Record<string, unknown>): {
    preventDefault: ReturnType<typeof vi.fn>;
  } {
    const event = { preventDefault: vi.fn() };
    contentHandler("before-input-event")(event, input);
    return event;
  }

  it("quits on Ctrl+Q", async () => {
    await loadMain();

    const event = input({ type: "keyDown", control: true, key: "q" });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.app.quit).toHaveBeenCalledTimes(1);
  });

  it("matches Ctrl+Q case-insensitively", async () => {
    await loadMain();

    input({ type: "keyDown", control: true, key: "Q" });

    expect(mocks.app.quit).toHaveBeenCalledTimes(1);
  });

  it("toggles fullscreen with F11", async () => {
    await loadMain();
    const window = win();

    expect(input({ type: "keyDown", key: "F11" }).preventDefault).toHaveBeenCalled();
    expect(window.setFullScreen).toHaveBeenLastCalledWith(true);

    input({ type: "keyDown", key: "F11" });
    expect(window.setFullScreen).toHaveBeenLastCalledWith(false);
  });

  it("ignores key-up events and other keys", async () => {
    await loadMain();

    input({ type: "keyUp", control: true, key: "q" });
    input({ type: "keyDown", control: false, key: "q" });
    input({ type: "keyDown", key: "F12" });

    expect(mocks.app.quit).not.toHaveBeenCalled();
    expect(win().setFullScreen).not.toHaveBeenCalled();
  });
});
