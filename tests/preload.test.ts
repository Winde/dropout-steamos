import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  applyEarlyMods: vi.fn(),
}));

vi.mock("../src/tv/run", () => ({ run: mocks.run }));
vi.mock("../src/tv/mods/runtime", () => ({
  applyEarlyMods: mocks.applyEarlyMods,
}));

function setMainFrame(value: boolean | undefined): void {
  const processLike = process as unknown as Record<string, unknown>;
  if (value === undefined) delete processLike.isMainFrame;
  else processLike.isMainFrame = value;
}

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => state,
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadPreload(): Promise<void> {
  vi.resetModules();
  await import("../src/preload/index");
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockResolvedValue(undefined);
  setMainFrame(undefined);
});

afterEach(() => {
  setMainFrame(undefined);
  Reflect.deleteProperty(document, "readyState");
});

describe("preload", () => {
  it("does nothing in subframes", async () => {
    setMainFrame(false);
    setReadyState("complete");

    await loadPreload();

    expect(mocks.applyEarlyMods).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("applies early mods before starting the TV layer", async () => {
    setMainFrame(true);
    setReadyState("complete");

    await loadPreload();

    expect(mocks.applyEarlyMods).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.applyEarlyMods.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.run.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("starts immediately when the document is already parsed", async () => {
    setMainFrame(true);
    setReadyState("complete");

    await loadPreload();

    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("waits for DOMContentLoaded while the document is loading", async () => {
    setMainFrame(true);
    setReadyState("loading");

    await loadPreload();

    expect(mocks.applyEarlyMods).toHaveBeenCalledTimes(1);
    expect(mocks.run).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();
    expect(mocks.run).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("reports a failure without breaking the page", async () => {
    setMainFrame(true);
    setReadyState("complete");
    const failure = new Error("boom");
    mocks.run.mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await loadPreload();

    expect(error).toHaveBeenCalledWith("[dropin] TV layer failed", failure);
  });
});
