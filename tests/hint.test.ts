import { beforeEach, describe, expect, it, vi } from "vitest";

type Hint = typeof import("../src/tv/hint");

function hintHost(): HTMLElement {
  const host = document.querySelector<HTMLElement>('[data-dropin="hint"]');
  if (!host) throw new Error("hint was not created");
  return host;
}

function pill(): HTMLElement {
  const element = hintHost().shadowRoot?.querySelector<HTMLElement>(".pill");
  if (!element) throw new Error("hint pill is missing");
  return element;
}

async function load(): Promise<Hint> {
  return import("../src/tv/hint");
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  for (const host of document.querySelectorAll('[data-dropin="hint"]')) {
    host.remove();
  }
});

describe("showHint", () => {
  it("shows a live-region pill", async () => {
    const hint = await load();
    hint.showHint("Player is not ready");

    const host = hintHost();
    expect(host.getAttribute("aria-live")).toBe("polite");
    expect(pill().textContent).toBe("Player is not ready");
    expect(pill().classList.contains("show")).toBe(true);
  });

  it("hides after the default duration", async () => {
    const hint = await load();
    hint.showHint("Saved");

    vi.advanceTimersByTime(2999);
    expect(pill().classList.contains("show")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(pill().classList.contains("show")).toBe(false);
  });

  it("respects a custom duration", async () => {
    const hint = await load();
    hint.showHint("Ended · B to go back", 5000);

    vi.advanceTimersByTime(4999);
    expect(pill().classList.contains("show")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(pill().classList.contains("show")).toBe(false);
  });

  it("reuses the same host and restarts the timer", async () => {
    const hint = await load();
    hint.showHint("First", 1000);
    vi.advanceTimersByTime(500);

    hint.showHint("Second", 1000);
    vi.advanceTimersByTime(500);
    expect(pill().textContent).toBe("Second");
    expect(pill().classList.contains("show")).toBe(true);

    vi.advanceTimersByTime(500);
    expect(pill().classList.contains("show")).toBe(false);

    hint.showHint("Third");
    expect(document.querySelectorAll('[data-dropin="hint"]')).toHaveLength(1);
    expect(pill().textContent).toBe("Third");
    expect(pill().classList.contains("show")).toBe(true);
  });
});
