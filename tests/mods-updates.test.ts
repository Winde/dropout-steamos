import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextMutation } from "./helpers";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn(),
  hideRing: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: { invoke: mocks.invoke, send: mocks.send },
}));

vi.mock("../src/tv/ring", () => ({ hideRing: mocks.hideRing }));

const { createUpdateUi } = await import("../src/tv/update");

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

interface Responses {
  check?: () => Promise<unknown>;
  notes?: () => Promise<unknown>;
  install?: () => Promise<unknown>;
}

function respond(responses: Responses = {}): void {
  mocks.invoke.mockImplementation((channel: string) => {
    switch (channel) {
      case "couch:version":
        return Promise.resolve("0.1.0");
      case "couch:update-check":
        return responses.check
          ? responses.check()
          : Promise.resolve({
              current: "0.1.0",
              latest: "0.2.0",
              available: true,
              canInstall: true,
            });
      case "couch:update-notes":
        return responses.notes
          ? responses.notes()
          : Promise.resolve([
              { version: "0.2.0", notes: "Player changes." },
            ]);
      case "couch:update-install":
        return responses.install ? responses.install() : Promise.resolve();
      default:
        return Promise.reject(new Error(`unexpected channel ${channel}`));
    }
  });
}

function addHeader(): HTMLElement {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="identity-container"></div>
    <div class="user-actions">
      <a href="/login">Sign In</a>
    </div>
  `;
  document.body.append(header);
  return header;
}

function setup(options: { header?: boolean } = {}) {
  if (options.header !== false) addHeader();
  const focus = {
    current: vi.fn<() => HTMLElement | null>(() => null),
    focus: vi.fn(),
    focusPage: vi.fn(() => true),
  };
  const ui = createUpdateUi(focus);
  ui.mount();

  const entry = document.querySelector<HTMLButtonElement>(".couch-update");
  if (options.header !== false && !entry)
    throw new Error("update entry did not mount");

  return { ui, focus, entry: entry as HTMLButtonElement };
}

function dialog(): ShadowRoot | null {
  return (
    document.querySelector<HTMLElement>('[data-couch="update-dialog"]')
      ?.shadowRoot ?? null
  );
}

function title(): string {
  return dialog()?.querySelector("#update-title")?.textContent ?? "";
}

function message(): string {
  return dialog()?.querySelector("#update-message")?.textContent ?? "";
}

function actionLabels(): string[] {
  return [...(dialog()?.querySelectorAll(".action") ?? [])].map(
    (button) => button.textContent ?? "",
  );
}

function activeAction(): string {
  return dialog()?.querySelector(".action.active")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const host of document.querySelectorAll("[data-couch]")) host.remove();
});

describe("header version line", () => {
  it("sits in the header and shows the check action", async () => {
    respond();
    const { entry } = setup();
    await flush();

    expect(entry.closest(".site-header")).not.toBeNull();
    expect(entry.parentElement?.classList.contains("user-actions")).toBe(true);
    expect(entry.textContent).toContain("Drop-In");
    expect(entry.textContent).toContain("v0.1.0");
    expect(entry.textContent).toContain("Check for updates");
    expect(entry.getAttribute("aria-label")).toContain("check for updates");
  });

  it("is a normal button, so the page's focus list already contains it", () => {
    respond();
    const { entry } = setup();

    expect(entry.tagName).toBe("BUTTON");
    expect(entry.getAttribute("tabindex")).toBeNull();
  });

  it("survives a version request that fails", async () => {
    mocks.invoke.mockImplementation((channel: string) =>
      channel === "couch:version"
        ? Promise.reject(new Error("no version"))
        : Promise.resolve({
            current: "0.1.0",
            latest: "0.1.0",
            available: false,
            canInstall: false,
          }),
    );
    const { entry } = setup();
    await flush();

    expect(entry.textContent).toContain("Drop-In");
    expect(entry.textContent).not.toContain("v0.1.0");
  });

  it("moves into a header that renders after the mod starts", async () => {
    respond();
    const { ui } = setup({ header: false });
    await flush();

    expect(document.querySelector(".couch-update")).toBeNull();

    addHeader();
    await nextMutation();

    expect(document.querySelector(".couch-update")?.closest(".site-header")).not.toBeNull();
    expect(ui.isOpen()).toBe(false);
  });

  it("puts itself back when the header is redrawn", async () => {
    respond();
    const { entry } = setup();
    await flush();

    document.querySelector(".site-header")?.remove();
    addHeader();
    await nextMutation();

    expect(entry.closest(".site-header")).not.toBeNull();
  });

  it("names an available release after a check", async () => {
    respond();
    const { ui, entry } = setup();
    await flush();

    entry.click();
    await flush();
    ui.close();
    await flush();

    expect(entry.textContent).toContain("Update to v0.2.0");
    expect(entry.classList.contains("available")).toBe(true);
  });
});

describe("update dialog", () => {
  it("opens from the header with the release, notes and actions", async () => {
    respond();
    const { entry } = setup();
    await flush();

    entry.click();
    await flush();

    expect(mocks.hideRing).toHaveBeenCalled();
    expect(entry.style.visibility).toBe("hidden");
    expect(title()).toBe("Drop-In v0.2.0 is available");
    expect(message()).toContain("You have v0.1.0");
    expect(dialog()?.textContent).toContain("Player changes.");
    expect(actionLabels()).toEqual(["Later", "Update now"]);
    expect(activeAction()).toBe("Later");
  });

  it("opens from Y (menu) anywhere on the page", async () => {
    respond();
    const { ui } = setup();
    await flush();

    expect(ui.action("menu")).toBe(true);
    await flush();

    expect(title()).toBe("Drop-In v0.2.0 is available");
    expect(ui.isOpen()).toBe(true);
  });

  it("still opens from Y on a page with no header", async () => {
    respond();
    const { ui } = setup({ header: false });
    await flush();

    expect(ui.action("menu")).toBe(true);
    await flush();

    expect(title()).toBe("Drop-In v0.2.0 is available");
  });

  it("moves between actions with left and right", async () => {
    respond();
    const { ui, entry } = setup();
    await flush();
    entry.click();
    await flush();

    ui.action("right");
    expect(activeAction()).toBe("Update now");
    ui.action("right");
    expect(activeAction()).toBe("Later");
    ui.action("left");
    expect(activeAction()).toBe("Update now");
  });

  it("installs an update and refuses to close while it runs", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    respond({ install: () => pending });
    const { ui, entry } = setup();
    await flush();
    entry.click();
    await flush();

    ui.action("right");
    ui.action("select");
    await flush();

    expect(mocks.invoke).toHaveBeenCalledWith("couch:update-install");
    expect(title()).toBe("Updating Drop-In");
    expect(message()).toContain("Downloading Drop-In v0.2.0");
    expect(actionLabels()).toEqual([]);
    expect(ui.action("back")).toBe(true);
    expect(dialog()).not.toBeNull();

    finish();
    await flush();

    expect(message()).toContain("installed. Restarting");
    expect(ui.action("back")).toBe(true);
    expect(dialog()).not.toBeNull();
  });

  it("closes on B and returns focus to where it was", async () => {
    respond({
      check: () =>
        Promise.resolve({
          current: "0.1.0",
          latest: "0.1.0",
          available: false,
          canInstall: false,
        }),
    });
    const previous = document.createElement("button");
    document.body.append(previous);
    const { ui, focus, entry } = setup();
    focus.current.mockReturnValue(previous);
    await flush();

    entry.click();
    await flush();
    expect(title()).toBe("You're up to date");
    expect(actionLabels()).toEqual(["Close"]);

    expect(ui.action("back")).toBe(true);

    expect(dialog()).toBeNull();
    expect(focus.focus).toHaveBeenCalledWith(previous);
    expect(entry.style.visibility).toBe("");
    expect(ui.isOpen()).toBe(false);
  });

  it("cleans an IPC failure and retries the check", async () => {
    let attempts = 0;
    respond({
      check: () => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(
            new Error(
              "Error invoking remote method 'couch:update-check': Error: GitHub answered 500. Try again later.",
            ),
          );
        }
        return Promise.resolve({
          current: "0.1.0",
          latest: "0.1.0",
          available: false,
          canInstall: false,
        });
      },
    });
    const { ui, entry } = setup();
    await flush();

    entry.click();
    await flush();

    expect(title()).toBe("Couldn't check for updates");
    expect(message()).toBe("GitHub answered 500. Try again later.");
    expect(actionLabels()).toEqual(["Close", "Try again"]);

    ui.action("right");
    ui.action("select");
    await flush();

    expect(title()).toBe("You're up to date");
    expect(attempts).toBe(2);
  });

  it("points a build that cannot update itself at the releases page", async () => {
    respond({
      check: () =>
        Promise.resolve({
          current: "0.1.0",
          latest: "0.2.0",
          available: true,
          canInstall: false,
        }),
    });
    const { ui, entry } = setup();
    await flush();

    entry.click();
    await flush();

    expect(message()).toContain("can't replace itself");
    expect(actionLabels()).toEqual(["Close", "Open releases"]);

    ui.action("right");
    ui.action("select");

    expect(mocks.send).toHaveBeenCalledWith("couch:update-page");
    expect(dialog()).toBeNull();
  });

  it("does not check again for a release it already knows", async () => {
    respond();
    const { ui, entry } = setup();
    await flush();

    entry.click();
    await flush();
    ui.close();
    await flush();
    entry.click();
    await flush();

    const checks = mocks.invoke.mock.calls.filter(
      ([channel]) => channel === "couch:update-check",
    );
    expect(checks).toHaveLength(1);
    expect(title()).toBe("Drop-In v0.2.0 is available");
  });

  it("swallows page actions while the dialog is open", async () => {
    respond();
    const { ui, entry } = setup();
    await flush();
    entry.click();
    await flush();

    for (const action of [
      "up",
      "down",
      "left",
      "right",
      "select",
      "menu",
    ] as const) {
      expect(ui.action(action)).toBe(true);
    }
  });
});
