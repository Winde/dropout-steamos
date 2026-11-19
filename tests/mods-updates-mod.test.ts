import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModContext } from "../src/tv/mods/types";

const mocks = vi.hoisted(() => ({
  createUpdateUi: vi.fn(),
  mount: vi.fn(),
  action: vi.fn(),
}));

vi.mock("../src/tv/update", () => ({
  createUpdateUi: mocks.createUpdateUi,
}));

/** The wrapper only reads these three fields from the context. */
function context(): ModContext {
  return {
    page: "catalog",
    path: "/browse",
    current: vi.fn(() => null),
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage: vi.fn(() => true),
  };
}

async function load(): Promise<typeof import("../src/tv/mods/updates")> {
  return import("../src/tv/mods/updates");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.createUpdateUi.mockReturnValue({
    mount: mocks.mount,
    action: mocks.action,
    isOpen: vi.fn(),
    close: vi.fn(),
  });
});

describe("updates mod", () => {
  it("mounts the shell's update UI with the focus it needs", async () => {
    const { updates } = await load();
    const ctx = context();

    updates.setup?.(ctx);

    expect(mocks.createUpdateUi).toHaveBeenCalledWith({
      current: ctx.current,
      focus: ctx.focus,
      focusPage: ctx.focusPage,
    });
    expect(mocks.mount).toHaveBeenCalledTimes(1);
  });

  it("offers every action to the dialog", async () => {
    const { updates } = await load();
    updates.setup?.(context());
    mocks.action.mockReturnValue(true);

    expect(updates.action?.("menu", context())).toBe(true);
    expect(mocks.action).toHaveBeenCalledWith("menu");
  });

  it("declines actions before the page has set it up", async () => {
    const { updates } = await load();

    expect(updates.action?.("menu", context())).toBe(false);
    expect(mocks.action).not.toHaveBeenCalled();
  });
});
