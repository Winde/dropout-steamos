import type { PageKind } from "../page";
import type { Mod } from "./types";
import css from "./startup-skeleton.css";

/**
 * Site change: cover the first document with a skeleton that copies the
 * storefront's own geometry.
 *
 * The site boots in visible pieces: the hero paints, React adds rows, the
 * cookie banner is dismissed, and initial focus lands 800 ms later. On a TV
 * that reads as a series of jumps. This veil is mounted before the body has
 * painted, so those states happen behind it. Once the first screen has
 * settled (or a cap is reached), the veil fades out over 380 ms. The page
 * underneath is never hidden, moved, or restyled by this mod.
 *
 * Only the first document of a session gets the veil. Navigating inside the
 * app opens a new document, and a skeleton on every click would feel heavier
 * than the site's own progress.
 */

const BOOTED_KEY = "dropin:booted";
const POLL_MS = 120;
const MIN_BOOT_MS = 400;
const SETTLE_MS = 140;
const FADE_MS = 380;

/** How long the veil may cover a page whose content never reports ready. */
const MAX_BOOT_MS: Record<PageKind, number> = {
  catalog: 6000,
  login: 6000,
  watch: 8000,
  other: 6000,
};

type Shape = "wide" | "portrait" | "square";

let host: HTMLElement | null = null;
let bodyObserver: MutationObserver | null = null;

function hasBooted(): boolean {
  try {
    return sessionStorage.getItem(BOOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function markBooted(): void {
  try {
    sessionStorage.setItem(BOOTED_KEY, "1");
  } catch {
    // Storage can be unavailable; the veil still works for this document.
  }
}

function promoMarkup(): string {
  return `
    <div class="promo" aria-hidden="true">
      <span class="sk promo-line" style="width: 290px"></span>
      <span class="sk promo-line short" style="width: 430px"></span>
    </div>`;
}

function headerMarkup(): string {
  const navWidths = [62, 104, 108, 62, 52, 48, 72];
  return `
    <header class="header">
      <span class="sk logo"></span>
      <nav class="nav" aria-hidden="true">
        ${navWidths
          .map(
            (width) =>
              `<span class="sk nav-item" style="width: ${width}px"></span>`,
          )
          .join("")}
      </nav>
      <div class="actions">
        <span class="sk action" style="width: 104px"></span>
        <span class="sk action" style="width: 54px"></span>
        <span class="sk action stamp"></span>
      </div>
    </header>`;
}

function cardMarkup(width: number): string {
  return `
    <div class="card">
      <div class="sk art"></div>
      <div class="sk line" style="width: ${width}%"></div>
    </div>`;
}

function rowMarkup(shape: Shape, lineWidths: number[]): string {
  return `
    <section class="row" data-shape="${shape}">
      <div class="sk row-title"></div>
      <div class="cards">${lineWidths.map(cardMarkup).join("")}</div>
    </section>`;
}

function catalogMarkup(): string {
  return `
    <div class="page catalog">
      ${promoMarkup()}
      ${headerMarkup()}
      <main class="rows">
        ${rowMarkup("wide", [78, 64, 72, 58, 70, 62])}
        ${rowMarkup("portrait", [64, 82, 70, 56, 76, 66])}
        ${rowMarkup("square", [72, 58, 80, 66, 62, 74])}
        ${rowMarkup("wide", [66, 76, 62, 70, 58, 72])}
      </main>
    </div>`;
}

function loginMarkup(): string {
  return `
    <div class="page login">
      ${promoMarkup()}
      ${headerMarkup()}
      <main class="login-main">
        <div class="panel">
          <div class="sk panel-title"></div>
          <div class="sk panel-sub"></div>
          <div class="sk field"></div>
          <div class="sk field"></div>
          <div class="sk button"></div>
        </div>
      </main>
    </div>`;
}

function otherMarkup(): string {
  return `
    <div class="page other">
      ${promoMarkup()}
      ${headerMarkup()}
      <main class="other-main">
        <div class="sk other-title"></div>
        <div class="sk other-line"></div>
        <div class="sk other-line"></div>
        <div class="sk other-line short"></div>
        <div class="sk other-line"></div>
      </main>
    </div>`;
}

function watchMarkup(): string {
  return `<div class="page watch"><span class="spinner"></span></div>`;
}

function pageMarkup(page: PageKind): string {
  switch (page) {
    case "catalog":
      return catalogMarkup();
    case "login":
      return loginMarkup();
    case "watch":
      return watchMarkup();
    case "other":
      return otherMarkup();
  }
}

/**
 * Builds the veil but leaves it detached: the body exists a few parser
 * steps after the preload runs, and appending into it there keeps the
 * skeleton out of <head> and in the document before the first paint.
 */
function createHost(page: PageKind): HTMLElement {
  const el = document.createElement("div");
  el.dataset.dropin = "boot";
  el.dataset.kind = page;
  el.setAttribute("aria-hidden", "true");

  const shadow = el.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${css}</style>${pageMarkup(page)}`;
  return el;
}

function attachToBody(el: HTMLElement): boolean {
  if (!document.body) return false;
  if (el.parentNode !== document.body) document.body.append(el);
  return true;
}

function mount(page: PageKind): HTMLElement {
  const el = createHost(page);

  const attach = (): boolean => {
    if (!attachToBody(el)) return false;
    // By the time the parser inserts <body>, the promo is often already
    // there. Sync now so the top of the veil is right on its first painted
    // frame, not one poll later.
    syncChrome(el, page);
    return true;
  };

  if (!attach()) {
    bodyObserver = new MutationObserver(() => {
      if (!attach()) return;
      bodyObserver?.disconnect();
      bodyObserver = null;
    });
    bodyObserver.observe(document, { childList: true, subtree: true });
  }
  return el;
}

/**
 * The one thing the veil takes from the live page: whether a marketing
 * banner sits above the header. Everything else is laid out from the
 * stylesheet's own measurements, so the skeleton never changes size while
 * the page's rows load.
 */
function hasPromo(): boolean {
  const promo = document.querySelector<HTMLElement>(".promo-banner");
  if (!promo) return false;

  const rect = promo.getBoundingClientRect();
  const style = getComputedStyle(promo);
  return (
    rect.height > 20 &&
    rect.height < 200 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function syncChrome(el: HTMLElement, page: PageKind): void {
  if (page === "watch") return;

  const pageEl = el.shadowRoot?.querySelector<HTMLElement>(".page");
  if (!pageEl) return;
  pageEl.classList.toggle("has-promo", hasPromo());
}

function imagesSettled(row: Element): boolean {
  const cards = row.querySelectorAll(".browse-item-card");
  if (cards.length === 0) return false;

  const images = [...row.querySelectorAll<HTMLImageElement>(".browse-item-card img")];
  if (images.length === 0) return true;

  const onScreen = images.filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.right > 0 && rect.left < innerWidth;
  });
  const relevant = (onScreen.length > 0 ? onScreen : images).slice(0, 8);
  return relevant.every((image) => image.complete);
}

function isReady(page: PageKind, path: string): boolean {
  const focused = document.querySelector(".dropin-focus") !== null;

  switch (page) {
    case "watch":
      return (
        document.querySelector("iframe#watch-embed") !== null &&
        document.readyState === "complete"
      );
    case "login": {
      const input = document.querySelector(
        '#signin-email-input, #signin-password-input, input[type="email"], input[type="password"]',
      );
      return input !== null && focused;
    }
    case "catalog": {
      if (!focused) return false;
      if (path.startsWith("/search")) return true;

      const rows = [...document.querySelectorAll<HTMLElement>(".browse-row")];
      if (rows.length === 0) return false;

      // The browse home shows two rows above the fold. Waiting for the
      // second keeps an empty band from appearing under the first.
      if ((path === "/" || path === "/browse") && rows.length < 2) {
        return false;
      }
      return imagesSettled(rows[0]!);
    }
    case "other":
      return document.readyState === "complete";
  }
}

/**
 * Waits for the page's own readiness signals, then lets the veil go. The
 * cap matters: a stalled API must not leave a TV showing a skeleton
 * forever.
 */
function finish(el: HTMLElement): void {
  if (!el.isConnected) return;

  let done = false;
  const remove = (): void => {
    if (done) return;
    done = true;
    markBooted();
    el.remove();
    if (host === el) host = null;
  };

  el.classList.add("leaving");
  el.addEventListener(
    "transitionend",
    (event) => {
      if (event.target === el) remove();
    },
    { once: true },
  );
  // The listener above is the normal path. This guard covers a missing
  // transition event (reduced motion, a background tab, a browser quirk).
  setTimeout(remove, FADE_MS + 140);
}

function boot(page: PageKind): void {
  if (host || hasBooted()) return;

  const path = location.pathname;
  const el = mount(page);
  host = el;

  // If this preload somehow runs after the body has parsed, align before the
  // first paint rather than waiting for the first poll.
  syncChrome(el, page);

  const started = Date.now();
  let settling = false;

  const tick = (): void => {
    if (!host || settling) return;

    syncChrome(el, page);

    const elapsed = Date.now() - started;
    if (elapsed < MIN_BOOT_MS) return;

    const max = MAX_BOOT_MS[page];
    if (elapsed < max && !isReady(page, path)) return;

    settling = true;
    clearInterval(timer);
    bodyObserver?.disconnect();
    bodyObserver = null;

    // One more beat after the last readiness signal: the browser has painted
    // the settled page and the skeleton can line up with it.
    setTimeout(() => {
      syncChrome(el, page);
      finish(el);
    }, SETTLE_MS);
  };

  const timer = setInterval(tick, POLL_MS);
}

/**
 * A mod so the veil is one removable line in the registry, like every other
 * change in this folder. It contributes only an `early` hook: by the time
 * `setup` would run, the DOM this needs has been parsed and the veil is
 * already in place.
 */
export const startupSkeleton: Mod = {
  id: "startup-skeleton",
  early(page) {
    try {
      boot(page);
    } catch (error) {
      // The loading veil must never stop the TV layer from starting.
      console.error("[dropin] startup skeleton failed", error);
    }
  },
};
