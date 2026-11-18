import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFocus } from "../src/tv/mods/cookie-focus";
import { cookieReject } from "../src/tv/mods/cookie-reject";
import type { ModContext } from "../src/tv/mods/types";

const mocks = vi.hoisted(() => ({
  dismissCookieBanner: vi.fn(),
  focusModalIfPresent: vi.fn(),
}));

vi.mock("../src/tv/focus", () => ({
  dismissCookieBanner: mocks.dismissCookieBanner,
  focusModalIfPresent: mocks.focusModalIfPresent,
}));

function banner(id = "ketch-banner"): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.append(el);
  return el;
}

function button(
  parent: HTMLElement,
  text: string,
  id?: string,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  if (id) el.id = id;
  parent.append(el);
  return el;
}

function context(focusPage = vi.fn()): ModContext {
  return {
    page: "catalog",
    path: "/browse",
    current: () => null,
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage,
  };
}

async function mutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.dismissCookieBanner.mockReset();
  mocks.focusModalIfPresent.mockReset();
});

describe("cookie-reject", () => {
  it("clicks the known tertiary button immediately", () => {
    const modal = banner();
    const known = button(modal, "Manage", "ketch-banner-button-tertiary");
    const reject = button(modal, "Reject All");
    const knownClick = vi.fn();
    const rejectClick = vi.fn();
    known.addEventListener("click", knownClick);
    reject.addEventListener("click", rejectClick);

    cookieReject.early!("catalog");

    expect(knownClick).toHaveBeenCalledTimes(1);
    expect(rejectClick).not.toHaveBeenCalled();
  });

  it("falls back to a button whose text says Reject", () => {
    const modal = banner();
    const accept = button(modal, "Accept All");
    const reject = button(modal, "Reject All");
    const acceptClick = vi.fn();
    const rejectClick = vi.fn();
    accept.addEventListener("click", acceptClick);
    reject.addEventListener("click", rejectClick);

    cookieReject.early!("catalog");

    expect(rejectClick).toHaveBeenCalledTimes(1);
    expect(acceptClick).not.toHaveBeenCalled();
  });

  it("waits for a banner that renders later", async () => {
    cookieReject.early!("catalog");

    const modal = banner();
    const reject = button(modal, "Reject All");
    const click = vi.fn();
    reject.addEventListener("click", click);

    await mutations();

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("stops watching after the banner is rejected", async () => {
    cookieReject.early!("catalog");

    const first = banner();
    const firstReject = button(first, "Reject All");
    const firstClick = vi.fn();
    firstReject.addEventListener("click", firstClick);
    await mutations();
    expect(firstClick).toHaveBeenCalledTimes(1);

    const second = banner("ketch-consent-banner");
    const secondReject = button(second, "Reject All");
    const secondClick = vi.fn();
    secondReject.addEventListener("click", secondClick);
    await mutations();

    expect(secondClick).not.toHaveBeenCalled();
  });

  it("gives up on pages that never show a banner", async () => {
    cookieReject.early!("catalog");
    vi.advanceTimersByTime(15_000);

    const modal = banner();
    const reject = button(modal, "Reject All");
    const click = vi.fn();
    reject.addEventListener("click", click);
    await mutations();

    expect(click).not.toHaveBeenCalled();
  });

  it("does nothing when the banner has no buttons", async () => {
    cookieReject.early!("catalog");
    banner();

    await mutations();
    expect(() => vi.advanceTimersByTime(15_000)).not.toThrow();
  });
});

describe("cookie-focus", () => {
  it("keeps watching while the modal is open", () => {
    const focusPage = vi.fn();
    mocks.focusModalIfPresent.mockReturnValue(true);

    cookieFocus.setup!(context(focusPage));
    vi.advanceTimersByTime(2100);

    expect(mocks.focusModalIfPresent).toHaveBeenCalledTimes(3);
    expect(focusPage).not.toHaveBeenCalled();
  });

  it("hands focus back after the modal closes", () => {
    const focusPage = vi.fn();
    mocks.focusModalIfPresent
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    cookieFocus.setup!(context(focusPage));
    vi.advanceTimersByTime(700);
    expect(focusPage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(focusPage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(700);
    expect(focusPage).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(700);
    expect(focusPage).toHaveBeenCalledTimes(1);
  });

  it("does not refocus when no modal ever appeared", () => {
    const focusPage = vi.fn();
    mocks.focusModalIfPresent.mockReturnValue(false);

    cookieFocus.setup!(context(focusPage));
    vi.advanceTimersByTime(3500);

    expect(focusPage).not.toHaveBeenCalled();
  });

  it("hands focus back once per modal appearance", () => {
    const focusPage = vi.fn();
    mocks.focusModalIfPresent
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    cookieFocus.setup!(context(focusPage));
    vi.advanceTimersByTime(2800);

    expect(focusPage).toHaveBeenCalledTimes(2);
  });

  it("uses B to dismiss the banner", () => {
    mocks.dismissCookieBanner.mockReturnValue(true);
    expect(cookieFocus.action!("back", context())).toBe(true);

    mocks.dismissCookieBanner.mockReturnValue(false);
    expect(cookieFocus.action!("back", context())).toBe(false);
  });

  it("ignores every other action", () => {
    expect(cookieFocus.action!("select", context())).toBe(false);
    expect(cookieFocus.action!("up", context())).toBe(false);
    expect(mocks.dismissCookieBanner).not.toHaveBeenCalled();
  });
});
