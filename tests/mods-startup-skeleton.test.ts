import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRect } from "./helpers";

type StartupModule = typeof import("../src/tv/mods/startup-skeleton");

async function load(): Promise<StartupModule> {
  vi.resetModules();
  return import("../src/tv/mods/startup-skeleton");
}

function card(withImage = true): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "browse-item-card";
  const art = document.createElement("div");
  art.className = "browse-image-container";
  wrapper.append(art);
  if (withImage) {
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { configurable: true, value: true });
    art.append(img);
  }
  return wrapper;
}

function row(item = card()): HTMLElement {
  const el = document.createElement("div");
  el.className = "browse-row";
  const head = document.createElement("div");
  head.className = "row-head";
  el.append(head, item);
  return el;
}

function focusedCard(): HTMLElement {
  const link = document.createElement("a");
  link.className = "dropin-focus";
  link.href = "/dimension-20";
  link.textContent = "Dimension 20";
  return link;
}

function mountHost(): HTMLElement {
  const host = document.querySelector<HTMLElement>('[data-dropin="boot"]');
  if (!host) throw new Error("the boot veil was not mounted");
  return host;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/browse");
  sessionStorage.clear();
});

describe("startup skeleton", () => {
  it("mounts a layout skeleton in a shadow root before the page has settled", async () => {
    vi.useFakeTimers();
    document.body.append(focusedCard());
    const { startupSkeleton } = await load();

    startupSkeleton.early!("catalog");

    const host = mountHost();
    expect(host.dataset.kind).toBe("catalog");
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(host.shadowRoot).not.toBeNull();

    const shadow = host.shadowRoot!;
    expect(shadow.querySelector(".header")).not.toBeNull();
    expect(shadow.querySelectorAll(".row")).toHaveLength(4);
    expect(shadow.querySelectorAll(".card")).toHaveLength(24);
    expect(shadow.querySelector(".promo")).not.toBeNull();

    // Let the cap finish so the interval cannot outlive the test.
    vi.advanceTimersByTime(7000);
  });

  it("waits for the catalog's first screen, then fades the veil away", async () => {
    vi.useFakeTimers();
    document.body.append(focusedCard(), row(), row());
    const { startupSkeleton } = await load();

    startupSkeleton.early!("catalog");
    const host = mountHost();

    // The first polls deliberately keep the veil up.
    vi.advanceTimersByTime(600);
    expect(host.isConnected).toBe(true);
    expect(host.classList.contains("leaving")).toBe(false);

    // Readiness, then the settle beat.
    vi.advanceTimersByTime(500);
    expect(host.classList.contains("leaving")).toBe(true);
    expect(host.isConnected).toBe(true);

    // jsdom never fires transitionend; the fallback completes the removal.
    vi.advanceTimersByTime(600);
    expect(document.querySelector('[data-dropin="boot"]')).toBeNull();
    expect(sessionStorage.getItem("dropin:booted")).toBe("1");
  });

  it("does not re-layout when the real rows arrive", async () => {
    vi.useFakeTimers();
    document.body.append(focusedCard());
    const { startupSkeleton } = await load();
    startupSkeleton.early!("catalog");
    const host = mountHost();
    const rows = [...host.shadowRoot!.querySelectorAll<HTMLElement>(".row")];
    const shapes = rows.map((rowEl) => rowEl.dataset.shape);

    // The page renders its own rows with their own aspect ratios while the
    // veil is up. The skeleton must already be the size it will fade from.
    const portrait = row();
    portrait
      .querySelector(".browse-image-container")!
      .classList.add("aspect_ratio_2_3");
    document.body.append(portrait);
    vi.advanceTimersByTime(150);

    expect(host.shadowRoot!.querySelectorAll(".card")).toHaveLength(24);
    expect(rows.map((rowEl) => rowEl.dataset.shape)).toEqual(shapes);
    expect(rows.every((rowEl) => rowEl.style.display === "")).toBe(true);

    // Let the veil finish so its interval cannot outlive the test.
    vi.advanceTimersByTime(7000);
  });

  it("reserves the promo strip only when the page has one", async () => {
    vi.useFakeTimers();
    const promo = document.createElement("div");
    promo.className = "promo-banner";
    document.body.append(promo);
    mockRect(promo, 0, 0, 1600, 71);

    const { startupSkeleton } = await load();
    startupSkeleton.early!("catalog");
    const host = mountHost();
    vi.advanceTimersByTime(150);

    const page = host.shadowRoot!.querySelector(".page")!;
    expect(page.classList.contains("has-promo")).toBe(true);

    // Let the veil finish so its interval cannot outlive the test.
    vi.advanceTimersByTime(7000);
  });

  it("keeps the skeleton off after the first document of the session", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("dropin:booted", "1");
    const { startupSkeleton } = await load();

    startupSkeleton.early!("catalog");

    expect(document.querySelector('[data-dropin="boot"]')).toBeNull();
  });

  it("reveals after the cap when the page never reports ready", async () => {
    vi.useFakeTimers();
    const { startupSkeleton } = await load();

    startupSkeleton.early!("catalog");
    const host = mountHost();

    vi.advanceTimersByTime(6200);
    expect(host.classList.contains("leaving")).toBe(true);

    vi.advanceTimersByTime(700);
    expect(document.querySelector('[data-dropin="boot"]')).toBeNull();
    expect(sessionStorage.getItem("dropin:booted")).toBe("1");
  });

  it("gives the watch page a player-shaped veil, not a catalog", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/dimension-20/season:1/videos/episode");
    const { startupSkeleton } = await load();

    startupSkeleton.early!("watch");

    const host = mountHost();
    expect(host.dataset.kind).toBe("watch");
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector(".spinner")).not.toBeNull();
    expect(shadow.querySelector(".header")).toBeNull();
    expect(shadow.querySelector(".row")).toBeNull();

    // The player iframe is the readiness signal.
    const frame = document.createElement("iframe");
    frame.id = "watch-embed";
    document.body.append(frame);

    vi.advanceTimersByTime(700);
    expect(host.classList.contains("leaving")).toBe(true);

    vi.advanceTimersByTime(600);
    expect(document.querySelector('[data-dropin="boot"]')).toBeNull();
  });
});
