import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerStatus } from "../src/tv/osd";

type Osd = typeof import("../src/tv/osd");

function status(overrides: Partial<PlayerStatus> = {}): PlayerStatus {
  return {
    playing: false,
    time: 0,
    duration: 0,
    subtitlesOn: false,
    muted: false,
    ...overrides,
  };
}

async function load(): Promise<{ osd: Osd; anchor: HTMLElement; host: HTMLElement }> {
  const osd = await import("../src/tv/osd");
  const anchor = document.createElement("div");
  document.body.append(anchor);
  osd.mountOsd(anchor);
  const host = anchor.querySelector<HTMLElement>('[data-dropin="osd"]');
  if (!host) throw new Error("OSD was not mounted");
  return { osd, anchor, host };
}

function barPart(host: HTMLElement, selector: string): HTMLElement {
  const part = host.shadowRoot?.querySelector<HTMLElement>(selector);
  if (!part) throw new Error(`missing ${selector}`);
  return part;
}

function buttons(host: HTMLElement): HTMLButtonElement[] {
  return [...(host.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

describe("mountOsd", () => {
  it("mounts one shadow-DOM overlay over the player", async () => {
    const { osd, anchor, host } = await load();

    expect(host.dataset.dropin).toBe("osd");
    expect(anchor.contains(host)).toBe(true);
    expect(host.shadowRoot).not.toBeNull();
    expect(buttons(host)).toHaveLength(4);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);

    osd.mountOsd(anchor);
    expect(anchor.querySelectorAll('[data-dropin="osd"]')).toHaveLength(1);
  });

  it("renders the initial stopped state", async () => {
    const { osd, host } = await load();
    osd.updateOsd(status());

    expect(barPart(host, ".play").textContent).toBe("▶");
    expect(barPart(host, ".time").textContent).toBe("0:00 / 0:00");
    expect(barPart(host, ".fill").style.width).toBe("0%");
    expect(barPart(host, ".cc").classList.contains("on")).toBe(false);
    expect(barPart(host, ".mute").classList.contains("on")).toBe(false);
  });

  it("hides itself after the opening timeout", async () => {
    const { host } = await load();
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);

    vi.advanceTimersByTime(3999);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(false);
  });
});

describe("updateOsd", () => {
  it("reflects playback, time, progress, subtitles, and mute", async () => {
    const { osd, host } = await load();

    osd.updateOsd(
      status({
        playing: true,
        time: 65,
        duration: 130,
        subtitlesOn: true,
        muted: true,
      }),
    );

    expect(barPart(host, ".play").textContent).toBe("❚❚");
    expect(barPart(host, ".time").textContent).toBe("1:05 / 2:10");
    expect(barPart(host, ".fill").style.width).toBe("50%");
    expect(barPart(host, ".cc").classList.contains("on")).toBe(true);
    expect(barPart(host, ".mute").classList.contains("on")).toBe(true);
  });

  it("shows the play glyph when paused", async () => {
    const { osd, host } = await load();
    osd.updateOsd(status({ playing: false }));
    expect(barPart(host, ".play").textContent).toBe("▶");
  });

  it("clamps progress to the track", async () => {
    const { osd, host } = await load();

    osd.updateOsd(status({ time: 200, duration: 100 }));
    expect(barPart(host, ".fill").style.width).toBe("100%");

    osd.updateOsd(status({ time: -5, duration: 100 }));
    expect(barPart(host, ".fill").style.width).toBe("0%");
  });

  it("draws no progress before a duration is known", async () => {
    const { osd, host } = await load();
    osd.updateOsd(status({ time: 30, duration: 0 }));
    expect(barPart(host, ".fill").style.width).toBe("0%");
  });

  it("is harmless before mounting", async () => {
    const osd = await import("../src/tv/osd");
    expect(() => osd.updateOsd(status({ playing: true }))).not.toThrow();
  });
});

describe("OSD visibility", () => {
  it("stays up when shown without a timeout", async () => {
    const { osd, host } = await load();
    osd.showOsd();

    vi.advanceTimersByTime(60_000);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
  });

  it("restarts the auto-hide countdown on each show", async () => {
    const { osd, host } = await load();

    osd.showOsd(1000);
    vi.advanceTimersByTime(600);
    osd.showOsd(500);
    vi.advanceTimersByTime(400);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(false);
  });

  it("does not auto-hide while the bar has focus", async () => {
    const { osd, host } = await load();
    osd.focusOsd();
    osd.showOsd(500);

    vi.advanceTimersByTime(500);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
  });

  it("hides a blurred bar while playing", async () => {
    const { osd, host } = await load();
    osd.focusOsd();
    osd.blurOsd(1000);

    vi.advanceTimersByTime(999);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(false);
  });
});

describe("OSD focus", () => {
  it("focuses the first control", async () => {
    const { osd, host } = await load();
    expect(osd.isOsdFocused()).toBe(false);

    osd.focusOsd();

    expect(osd.isOsdFocused()).toBe(true);
    expect(buttons(host)[0].classList.contains("focus")).toBe(true);
    expect(barPart(host, ".bar").classList.contains("visible")).toBe(true);
  });

  it("moves the highlight and wraps at both ends", async () => {
    const { osd, host } = await load();
    osd.focusOsd();

    osd.moveOsd(1);
    expect(buttons(host)[1].classList.contains("focus")).toBe(true);

    osd.moveOsd(3);
    expect(buttons(host)[0].classList.contains("focus")).toBe(true);

    osd.moveOsd(-1);
    expect(buttons(host)[3].classList.contains("focus")).toBe(true);
  });

  it("ignores movement when it does not own focus", async () => {
    const { osd, host } = await load();
    osd.moveOsd(1);
    expect(buttons(host)[0].classList.contains("focus")).toBe(true);
  });

  it("reports the highlighted control", async () => {
    const { osd } = await load();

    expect(osd.activateOsd()).toBeNull();
    osd.focusOsd();
    expect(osd.activateOsd()).toBe("play");
    osd.moveOsd(1);
    expect(osd.activateOsd()).toBe("subtitles");
    osd.moveOsd(1);
    expect(osd.activateOsd()).toBe("mute");
    osd.moveOsd(1);
    expect(osd.activateOsd()).toBe("exit");
  });

  it("clears the highlight when blurred", async () => {
    const { osd, host } = await load();
    osd.focusOsd();
    osd.moveOsd(2);
    osd.blurOsd();

    expect(osd.isOsdFocused()).toBe(false);
    expect(
      buttons(host).some((button) => button.classList.contains("focus")),
    ).toBe(false);
  });

  it("does nothing when focus or movement is requested before mounting", async () => {
    const osd = await import("../src/tv/osd");
    expect(() => osd.focusOsd()).not.toThrow();
    expect(() => osd.moveOsd(1)).not.toThrow();
    expect(osd.activateOsd()).toBeNull();
    expect(osd.isOsdFocused()).toBe(false);
  });
});

describe("OSD button clicks", () => {
  it("reports the clicked control", async () => {
    const { osd, host } = await load();
    const handler = vi.fn();
    osd.setOsdHandler(handler);

    buttons(host)[0].click();
    buttons(host)[1].click();
    buttons(host)[2].click();
    buttons(host)[3].click();

    expect(handler.mock.calls.map(([control]) => control)).toEqual([
      "play",
      "subtitles",
      "mute",
      "exit",
    ]);
  });

  it("moves the highlight to the clicked control", async () => {
    const { osd, host } = await load();
    osd.focusOsd();
    osd.setOsdHandler(vi.fn());

    buttons(host)[2].click();

    expect(buttons(host)[2].classList.contains("focus")).toBe(true);
    osd.moveOsd(1);
    expect(buttons(host)[3].classList.contains("focus")).toBe(true);
  });
});
