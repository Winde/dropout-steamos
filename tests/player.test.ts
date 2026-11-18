import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerControl } from "../src/tv/player";

type PlayerModule = typeof import("../src/tv/player");
type OsdModule = typeof import("../src/tv/osd");

interface Posted {
  method: string;
  params: unknown;
}

interface Loaded {
  player: PlayerModule;
  osd: OsdModule;
  control: PlayerControl;
  playerEl: HTMLElement;
  iframe: HTMLIFrameElement;
  posted: Posted[];
}

function postMessageSpy(iframe: HTMLIFrameElement, posted: Posted[]): void {
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: vi.fn((raw: string) => {
      posted.push(JSON.parse(raw) as Posted);
    }),
  });
}

async function load(withFrame = true): Promise<Loaded> {
  vi.resetModules();

  const playerEl = document.createElement("div");
  playerEl.id = "watch-player";
  document.body.append(playerEl);

  let iframe: HTMLIFrameElement;
  if (withFrame) {
    iframe = document.createElement("iframe");
    iframe.id = "watch-embed";
    playerEl.append(iframe);
  } else {
    iframe = document.createElement("iframe");
    iframe.id = "watch-embed";
  }

  const posted: Posted[] = [];
  if (withFrame) postMessageSpy(iframe, posted);

  const player = await import("../src/tv/player");
  const osd = await import("../src/tv/osd");
  const control = player.attachPlayer();

  return { player, osd, control, playerEl, iframe, posted };
}

function osdHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-couch="osd"]');
}

function osdPart(selector: string): HTMLElement {
  const host = osdHost();
  const part = host?.shadowRoot?.querySelector<HTMLElement>(selector);
  if (!part) throw new Error(`missing OSD part ${selector}`);
  return part;
}

function hintText(): string | null {
  const hosts = document.querySelectorAll<HTMLElement>('[data-couch="hint"]');
  const host = hosts[hosts.length - 1];
  return (
    host?.shadowRoot?.querySelector<HTMLElement>(".pill")?.textContent ?? null
  );
}

function message(data: unknown, origin = "https://embed.vhx.tv"): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  for (const host of document.querySelectorAll(
    '[data-couch="hint"], [data-couch="osd"]',
  )) {
    host.remove();
  }
});

describe("wire protocol", () => {
  it("posts JSON commands to the player frame", async () => {
    const { control, posted } = await load();

    control.action("select");

    expect(posted).toEqual([{ method: "play", params: null }]);
  });

  it("does nothing when the frame is missing", async () => {
    const { control } = await load(false);

    expect(() => control.action("select")).not.toThrow();
    expect(hintText()).toBe("Player is not ready");
  });

  it("sends seek targets and clamps at zero", async () => {
    const { control, posted } = await load();

    control.action("right");
    control.action("right");
    control.action("left");
    control.action("seekbackmin");
    control.action("seekforwardmin");

    expect(posted).toEqual([
      { method: "seekToTime", params: [10] },
      { method: "seekToTime", params: [20] },
      { method: "seekToTime", params: [10] },
      { method: "seekToTime", params: [0] },
      { method: "seekToTime", params: [60] },
    ]);
  });

  it("uses the media clock for seeking", async () => {
    const { control, posted } = await load();
    message({ method: "timeupdate", params: { current_time: 100 } });

    control.action("right");
    control.action("seekbackmin");

    expect(posted.at(-2)).toEqual({ method: "seekToTime", params: [110] });
    expect(posted.at(-1)).toEqual({ method: "seekToTime", params: [50] });
  });
});

describe("media messages", () => {
  it("only accepts messages from the player origins", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    message(
      { method: "timeupdate", params: { current_time: 5, duration: 60 } },
      "https://evil.example",
    );
    expect(osdPart(".time").textContent).toBe("0:00 / 0:00");

    message(
      { method: "timeupdate", params: { current_time: 5, duration: 60 } },
      "https://player.vimeo.com",
    );
    expect(osdPart(".time").textContent).toBe("0:05 / 1:00");

    control.action("select");
    expect(posted.at(-1)?.method).toBe("play");
  });

  it("ignores malformed messages", async () => {
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    expect(() => message("not json")).not.toThrow();
    expect(() => message(null)).not.toThrow();
    expect(() => message({ method: 42 })).not.toThrow();
    expect(osdPart(".time").textContent).toBe("0:00 / 0:00");
  });

  it("updates time and duration as the player reports them", async () => {
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    message({
      method: "timeupdate",
      params: { current_time: 12, duration: 90 },
    });
    expect(osdPart(".time").textContent).toBe("0:12 / 1:30");
    expect(parseFloat(osdPart(".fill").style.width)).toBeCloseTo(13.33, 1);

    message({ method: "durationchange", params: { duration: 120 } });
    expect(osdPart(".time").textContent).toBe("0:12 / 2:00");

    // A timeupdate without a duration must not erase the known duration.
    message({ method: "timeupdate", params: { current_time: 13 } });
    expect(osdPart(".time").textContent).toBe("0:13 / 2:00");
  });

  it("tracks play and pause", async () => {
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    message({ method: "play" });
    expect(osdPart(".play").textContent).toBe("❚❚");

    message({ method: "pause" });
    expect(osdPart(".play").textContent).toBe("▶");
    expect(osdPart(".bar").classList.contains("visible")).toBe(true);
  });

  it("treats resume like play", async () => {
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    message({ method: "resume" });
    expect(osdPart(".play").textContent).toBe("❚❚");
  });

  it("shows a hint when playback ends", async () => {
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    message({ method: "ended" });
    expect(osdPart(".play").textContent).toBe("▶");
    expect(hintText()).toBe("Ended · B to go back");
  });

  it("ignores a response without a method or with no waiter", async () => {
    await load();
    expect(() => message({ method: "response", params: {} })).not.toThrow();
    expect(() =>
      message({ method: "response", params: { method: "unknown" } }),
    ).not.toThrow();
  });
});

describe("play/pause and mute", () => {
  it("toggles playback and updates the OSD", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("select");
    expect(posted.at(-1)).toEqual({ method: "play", params: null });
    expect(osdPart(".play").textContent).toBe("❚❚");

    control.action("playpause");
    expect(posted.at(-1)).toEqual({ method: "pause", params: null });
    expect(osdPart(".play").textContent).toBe("▶");
  });

  it("toggles mute and marks the OSD", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("mute");
    expect(posted.at(-1)).toEqual({ method: "muted", params: [true] });
    expect(osdPart(".mute").classList.contains("on")).toBe(true);

    control.action("mute");
    expect(posted.at(-1)).toEqual({ method: "muted", params: [false] });
    expect(osdPart(".mute").classList.contains("on")).toBe(false);
  });
});

describe("subtitles", () => {
  it("enables the first English track", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("subtitles");
    expect(posted.at(-1)).toEqual({ method: "getSubtitles", params: null });

    message({
      method: "response",
      params: {
        method: "getSubtitles",
        response: JSON.stringify([
          { language: "fr-FR", label: "French" },
          { language: "en-GB", label: "English" },
        ]),
      },
    });
    await flush();

    expect(posted.at(-1)).toEqual({
      method: "setSubtitle",
      params: ["en-GB"],
    });
    expect(osdPart(".cc").classList.contains("on")).toBe(true);

    control.action("subtitles");
    message({
      method: "response",
      params: {
        method: "getSubtitles",
        response: [{ language: "en-GB", label: "English" }],
      },
    });
    await flush();

    expect(posted.at(-1)).toEqual({ method: "setSubtitle", params: [null] });
    expect(osdPart(".cc").classList.contains("on")).toBe(false);
  });

  it("prefers a track whose label says English", async () => {
    const { control, posted } = await load();

    control.action("subtitles");
    message({
      method: "response",
      params: {
        method: "getSubtitles",
        response: JSON.stringify([
          { language: "fr-FR", label: "French" },
          { language: "de-DE", label: "English" },
        ]),
      },
    });
    await flush();

    expect(posted.at(-1)).toEqual({
      method: "setSubtitle",
      params: ["de-DE"],
    });
  });

  it("falls back to the first track with a language", async () => {
    const { control, posted } = await load();

    control.action("subtitles");
    message({
      method: "response",
      params: {
        method: "getSubtitles",
        response: [
          { language: "fr-FR", label: "French" },
          { language: "es-ES", label: "Spanish" },
        ],
      },
    });
    await flush();

    expect(posted.at(-1)).toEqual({
      method: "setSubtitle",
      params: ["fr-FR"],
    });
  });

  it("hints when no tracks are available", async () => {
    const { control, posted } = await load();

    control.action("subtitles");
    message({
      method: "response",
      params: { method: "getSubtitles", response: "[]" },
    });
    await flush();

    expect(hintText()).toBe("No subtitles available");
    expect(posted.some((entry) => entry.method === "setSubtitle")).toBe(false);
  });

  it("hints when tracks have no language", async () => {
    const { control } = await load();

    control.action("subtitles");
    message({
      method: "response",
      params: {
        method: "getSubtitles",
        response: [{ label: "English" }],
      },
    });
    await flush();

    expect(hintText()).toBe("No subtitles available");
  });

  it("hints when the response is not valid JSON", async () => {
    const { control } = await load();

    control.action("subtitles");
    message({
      method: "response",
      params: { method: "getSubtitles", response: "{" },
    });
    await flush();

    expect(hintText()).toBe("No subtitles available");
  });

  it("hints when the player never answers", async () => {
    const { control } = await load();

    control.action("subtitles");
    vi.advanceTimersByTime(900);
    await flush();

    expect(hintText()).toBe("No subtitles available");
  });
});

describe("OSD focus and controls", () => {
  it("focuses the OSD from up, down, or the player-controls button", async () => {
    const { osd, control } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    expect(osd.isOsdFocused()).toBe(true);

    control.action("down");
    expect(osd.isOsdFocused()).toBe(false);

    control.action("playercontrols");
    expect(osd.isOsdFocused()).toBe(true);
  });

  it("moves the highlight with left and right without seeking", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    expect(osd.activateOsd()).toBe("play");

    control.action("right");
    expect(osd.activateOsd()).toBe("subtitles");
    control.action("right");
    expect(osd.activateOsd()).toBe("mute");
    control.action("left");
    expect(osd.activateOsd()).toBe("subtitles");

    expect(posted.some((entry) => entry.method === "seekToTime")).toBe(false);
  });

  it("activates the highlighted control with A", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    control.action("select");
    expect(posted.at(-1)).toEqual({ method: "play", params: null });

    control.action("right");
    control.action("right");
    control.action("select");
    expect(posted.at(-1)).toEqual({ method: "muted", params: [true] });
  });

  it("keeps seek shortcuts while the OSD is focused", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    control.action("right");
    expect(osd.activateOsd()).toBe("subtitles");

    control.action("seekforward");
    expect(posted.at(-1)).toEqual({ method: "seekToTime", params: [10] });

    control.action("seekbackmin");
    expect(posted.at(-1)).toEqual({ method: "seekToTime", params: [0] });
  });

  it("leaves the OSD and keeps it visible while paused", async () => {
    const { osd, control } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    control.action("back");

    expect(osd.isOsdFocused()).toBe(false);
    expect(osdPart(".bar").classList.contains("visible")).toBe(true);
  });

  it("leaves the OSD and auto-hides while playing", async () => {
    const { osd, control } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("select");
    control.action("up");
    expect(osd.isOsdFocused()).toBe(true);

    control.action("back");

    expect(osd.isOsdFocused()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(osdPart(".bar").classList.contains("visible")).toBe(false);
  });

  it("runs subtitle and mute shortcuts while the OSD is focused", async () => {
    const { osd, control, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    control.action("subtitles");
    expect(posted.at(-1)).toEqual({ method: "getSubtitles", params: null });

    control.action("mute");
    expect(posted.at(-1)).toEqual({ method: "muted", params: [true] });
  });

  it("activates the back control and leaves the page", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    const { osd, control } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    control.action("up");
    control.action("left");
    expect(osd.activateOsd()).toBe("exit");
    control.action("select");

    expect(osd.isOsdFocused()).toBe(false);
    expect(back).toHaveBeenCalled();
  });
});

describe("OSD clicks", () => {
  it("wires the bar buttons to player commands", async () => {
    const { osd, posted } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    const buttons = [
      ...osdHost()!.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
    ];
    buttons[0]?.click();
    expect(posted.at(-1)).toEqual({ method: "play", params: null });

    buttons[2]?.click();
    expect(posted.at(-1)).toEqual({ method: "muted", params: [true] });

    buttons[1]?.click();
    expect(posted.at(-1)).toEqual({ method: "getSubtitles", params: null });
  });

  it("runs Back from the OSD's exit button", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    const { osd } = await load();
    osd.mountOsd(document.querySelector<HTMLElement>("#watch-player")!);

    const buttons = [
      ...osdHost()!.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
    ];
    buttons[3]?.click();

    expect(back).toHaveBeenCalled();
  });
});

describe("mounting", () => {
  it("waits for the player section and iframe before mounting the OSD", async () => {
    const { posted } = await load();

    expect(osdHost()).toBeNull();
    vi.advanceTimersByTime(249);
    expect(osdHost()).toBeNull();

    vi.advanceTimersByTime(1);
    expect(osdHost()).not.toBeNull();
    expect(posted).toContainEqual({ method: "muted", params: null });
  });

  it("reads the initial mute state from the player", async () => {
    const { osd } = await load();
    vi.advanceTimersByTime(250);

    message({
      method: "response",
      params: { method: "muted", response: true },
    });
    await flush();

    expect(osdPart(".mute").classList.contains("on")).toBe(true);
  });

  it("gives up after ten seconds without a player", async () => {
    const { playerEl, iframe } = await load(false);
    expect(osdHost()).toBeNull();

    vi.advanceTimersByTime(250 * 41);
    playerEl.append(iframe);
    vi.advanceTimersByTime(250);

    expect(osdHost()).toBeNull();
  });
});

describe("back navigation", () => {
  it("walks history when an earlier page exists", async () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    const { control } = await load();

    control.action("back");

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("falls back to browse when there is no history", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, pathname: "/show" });
    const { control } = await load(false);

    control.action("back");

    expect(assign).toHaveBeenCalledWith("/browse");
  });
});
