import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: { send: mocks.send },
}));

const { quitApp } = await import("../src/tv/quit");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quitApp", () => {
  it("asks the main process to quit", () => {
    quitApp();
    expect(mocks.send).toHaveBeenCalledWith("couch:quit");
  });

  it("sends one message per request", () => {
    quitApp();
    quitApp();
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
