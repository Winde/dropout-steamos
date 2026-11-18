import { beforeEach, describe, expect, it, vi } from "vitest";
import { cursor } from "../src/tv/mods/cursor";
import { player } from "../src/tv/mods/player";
import type { ModContext } from "../src/tv/mods/types";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  attachPlayer: vi.fn(),
}));

vi.mock("../src/tv/player", () => ({
  attachPlayer: mocks.attachPlayer,
}));

function context(): ModContext {
  return {
    page: "watch",
    path: "/show/videos/episode",
    current: () => null,
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.documentElement.className = "";
  mocks.attachPlayer.mockReturnValue({ action: mocks.action });
});

describe("player mod", () => {
  it("attaches the player remote during setup", () => {
    player.setup!(context());
    expect(mocks.attachPlayer).toHaveBeenCalledTimes(1);
  });

  it("owns focus on the watch page", () => {
    expect(player.focus!(context())).toBe(true);
  });

  it("forwards every action to the player", () => {
    player.setup!(context());

    expect(player.action!("up", context())).toBe(true);
    expect(player.action!("select", context())).toBe(true);
    expect(player.action!("subtitles", context())).toBe(true);
    expect(mocks.action.mock.calls.map(([action]) => action)).toEqual([
      "up",
      "select",
      "subtitles",
    ]);
  });

  it("always consumes actions, even before setup", () => {
    expect(player.action!("back", context())).toBe(true);
  });
});

describe("cursor mod", () => {
  it("hides the pointer after 2.5 seconds", () => {
    cursor.setup!(context());
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      false,
    );

    vi.advanceTimersByTime(2499);
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      false,
    );
    vi.advanceTimersByTime(1);
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      true,
    );
  });

  it("brings the pointer back and restarts the countdown on movement", () => {
    cursor.setup!(context());
    vi.advanceTimersByTime(2500);
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      true,
    );

    window.dispatchEvent(new Event("mousemove"));
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      false,
    );

    vi.advanceTimersByTime(2499);
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      false,
    );
    vi.advanceTimersByTime(1);
    expect(document.documentElement.classList.contains("couch-hide-cursor")).toBe(
      true,
    );
  });
});
