import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../src/tv/input";

const mocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  startInput: vi.fn(),
  pageKind: vi.fn(),
  startMods: vi.fn(),
  action: vi.fn(),
  navigate: vi.fn(),
  focus: vi.fn(),
}));

vi.mock("../src/tv/focus", () => ({ getCurrent: mocks.getCurrent }));
vi.mock("../src/tv/input", () => ({ startInput: mocks.startInput }));
vi.mock("../src/tv/page", () => ({ pageKind: mocks.pageKind }));
vi.mock("../src/tv/mods/runtime", () => ({ startMods: mocks.startMods }));

type Run = typeof import("../src/tv/run");
type InputOptions = {
  watchMode: boolean;
  onAction: (action: Action) => void;
};

async function load(): Promise<Run> {
  vi.resetModules();
  return import("../src/tv/run");
}

function inputOptions(): InputOptions {
  const options = mocks.startInput.mock.calls[0]?.[0] as
    | InputOptions
    | undefined;
  if (!options) throw new Error("startInput was not called");
  return options;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pageKind.mockReturnValue("catalog");
  mocks.getCurrent.mockReturnValue(null);
  mocks.startInput.mockReturnValue(vi.fn());
  mocks.action.mockReturnValue(false);
  mocks.startMods.mockReturnValue({
    action: mocks.action,
    navigate: mocks.navigate,
    focus: mocks.focus,
  });
  delete (window as unknown as Record<string, unknown>).__dropinTv;
  document.documentElement.className = "";
  window.history.replaceState({}, "", "/browse");
});

describe("run", () => {
  it("boots the TV layer for a catalog page", async () => {
    const { run } = await load();

    await run();

    expect(mocks.pageKind).toHaveBeenCalledWith("/browse");
    expect(mocks.startMods).toHaveBeenCalledWith("catalog");
    expect(document.documentElement.classList.contains("dropin-catalog")).toBe(
      true,
    );
    expect(inputOptions().watchMode).toBe(false);
    expect(mocks.focus).toHaveBeenCalledTimes(1);
  });

  it("marks watch pages and switches input to watch mode", async () => {
    window.history.replaceState(
      {},
      "",
      "/dimension-20/season:1/videos/episode",
    );
    mocks.pageKind.mockReturnValue("watch");
    const { run } = await load();

    await run();

    expect(mocks.startMods).toHaveBeenCalledWith("watch");
    expect(document.documentElement.classList.contains("dropin-watch")).toBe(true);
    expect(inputOptions().watchMode).toBe(true);
  });

  it("marks login pages", async () => {
    window.history.replaceState({}, "", "/login");
    mocks.pageKind.mockReturnValue("login");
    const { run } = await load();

    await run();

    expect(document.documentElement.classList.contains("dropin-login")).toBe(
      true,
    );
  });

  it("is idempotent within one document", async () => {
    const { run } = await load();

    await run();
    await run();

    expect(mocks.startMods).toHaveBeenCalledTimes(1);
    expect(mocks.startInput).toHaveBeenCalledTimes(1);
    expect(mocks.focus).toHaveBeenCalledTimes(1);
  });

  it("does nothing when another run already claimed the page", async () => {
    (window as unknown as Record<string, unknown>).__dropinTv = true;
    const { run } = await load();

    await run();

    expect(mocks.startMods).not.toHaveBeenCalled();
    expect(mocks.startInput).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("dropin-catalog")).toBe(
      false,
    );
  });
});

describe("actions", () => {
  it("clicks the focused element on select", async () => {
    const target = document.createElement("a");
    const click = vi.fn();
    target.addEventListener("click", click);
    mocks.getCurrent.mockReturnValue(target);
    const { run } = await load();
    await run();

    inputOptions().onAction("select");

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("lets the page's mods consume an action first", async () => {
    const target = document.createElement("a");
    const click = vi.fn();
    target.addEventListener("click", click);
    mocks.getCurrent.mockReturnValue(target);
    mocks.action.mockReturnValue(true);
    const { run } = await load();
    await run();

    inputOptions().onAction("select");

    expect(mocks.action).toHaveBeenCalledWith("select");
    expect(click).not.toHaveBeenCalled();
  });

  it("navigates in each direction through the mods", async () => {
    const { run } = await load();
    await run();
    const { onAction } = inputOptions();

    for (const direction of ["up", "down", "left", "right"] as const) {
      onAction(direction);
      expect(mocks.navigate).toHaveBeenLastCalledWith(direction);
    }
    expect(mocks.navigate).toHaveBeenCalledTimes(4);
  });

  it("walks history on back", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { run } = await load();
    await run();

    inputOptions().onAction("back");

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("falls back to browse when there is no history", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, pathname: "/browse" });
    const { run } = await load();
    await run();

    inputOptions().onAction("back");

    expect(assign).toHaveBeenCalledWith("/browse");
  });

  it("ignores menu and unassigned actions", async () => {
    const { run } = await load();
    await run();
    const { onAction } = inputOptions();

    expect(() => onAction("menu")).not.toThrow();
    expect(() => onAction("seekforward")).not.toThrow();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.action).toHaveBeenCalledWith("menu");
    expect(mocks.action).toHaveBeenCalledWith("seekforward");
  });

  it("offers every action to the mods first", async () => {
    const { run } = await load();
    await run();
    const { onAction } = inputOptions();

    onAction("back");
    onAction("select");
    onAction("right");

    expect(mocks.action.mock.calls.map(([action]) => action)).toEqual([
      "back",
      "select",
      "right",
    ]);
  });
});
