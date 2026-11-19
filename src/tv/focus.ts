import type { Box, Candidate } from "./nav";
import { setRing } from "./ring";

const FOCUS_CLASS = "dropin-focus";
const STORAGE_PREFIX = "dropin:focus:";
const MODAL_SELECTORS = ["#ketch-banner", "#ketch-consent-banner"];
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let current: HTMLElement | null = null;
let scrollToken = 0;

/**
 * Mods can refine the candidate list (for example, merging duplicate links
 * inside one card). The registry sets this once per page.
 */
export type FocusRefiner = (
  candidates: Candidate<HTMLElement>[],
) => Candidate<HTMLElement>[];

let refine: FocusRefiner = (candidates) => candidates;

export function setFocusRefiner(next: FocusRefiner): void {
  refine = next;
}

export function getCurrent(): HTMLElement | null {
  if (!current || !current.isConnected) return null;
  return current;
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest("[data-dropin]")) return false;
  if (
    el.closest(
      ".browse-left-arrow, .browse-right-arrow, .slick-arrow, .carousel-arrow",
    )
  ) {
    return false;
  }
  if (el.closest('[aria-hidden="true"]')) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.hasAttribute("disabled")) return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  if (el.tabIndex < 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;

  const style = getComputedStyle(el);
  if (
    style.visibility === "hidden" ||
    style.display === "none" ||
    style.opacity === "0"
  ) {
    return false;
  }

  return true;
}

function isShown(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function activeModal(): HTMLElement | null {
  for (const selector of MODAL_SELECTORS) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (isShown(el)) return el;
    }
  }
  return null;
}

function collectWithin(root: ParentNode): Candidate<HTMLElement>[] {
  const out: Candidate<HTMLElement>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (!isVisible(el)) continue;
    out.push({ el, box: el.getBoundingClientRect() as Box });
  }
  return refine(out);
}

export function collectFocusables(): Candidate<HTMLElement>[] {
  const modal = activeModal();
  if (modal) {
    const inside = collectWithin(modal);
    if (inside.length > 0) return inside;
  }
  return collectWithin(document);
}

/**
 * The site moves focus on its own: autofocus on load, the password step after
 * Next, dialogs. Adopt that focus so D-pad navigation always starts from what
 * the user can see, not from a stale element the site just hid.
 */
function adoptFocus(event: FocusEvent): void {
  const el = event.target;
  if (!(el instanceof HTMLElement) || el === current) return;
  if (el.closest("[data-dropin]")) return;
  if (!el.matches(FOCUSABLE_SELECTOR)) return;
  if (!isVisible(el)) return;

  if (current) current.classList.remove(FOCUS_CLASS);
  current = el;
  el.classList.add(FOCUS_CLASS);
  setRing(el);
}

document.addEventListener("focusin", adoptFocus);

function focusKey(el: HTMLElement): string {
  return (
    el.getAttribute("href") ??
    el.getAttribute("aria-label") ??
    (el.textContent ?? "").trim().slice(0, 60)
  );
}

function storeFocus(el: HTMLElement): void {
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${location.pathname}`,
      focusKey(el),
    );
  } catch {
    // Storage can be unavailable; focus memory is optional.
  }
}

function scrollVertically(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const topSafe = 96;
  const bottomSafe = window.innerHeight - 56;
  if (rect.top >= topSafe && rect.bottom <= bottomSafe) return;

  const top = window.scrollY + rect.top - window.innerHeight * 0.38;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/**
 * Rows are slick carousels. They do not scroll natively, and calling
 * scrollIntoView on a card can shift the whole page sideways. For rows we
 * click the site's own arrow, which is the least invasive way to move the
 * carousel. Everything else gets a normal scroll.
 */
function scrollHorizontally(el: HTMLElement): void {
  const row = el.closest(".browse-row");
  const rect = el.getBoundingClientRect();

  if (!row) {
    if (rect.left < 0 || rect.right > window.innerWidth) {
      el.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }
    return;
  }

  const rowRect = row.getBoundingClientRect();
  const margin = 8;
  if (
    rect.left >= rowRect.left + margin &&
    rect.right <= rowRect.right - margin
  ) {
    return;
  }

  const direction = rect.left < rowRect.left ? "left" : "right";
  const arrow = row.querySelector<HTMLElement>(
    direction === "left" ? ".browse-left-arrow" : ".browse-right-arrow",
  );
  if (!arrow) return;

  const token = ++scrollToken;
  let attempts = 0;

  const step = (): void => {
    if (token !== scrollToken || attempts++ > 6) return;
    const next = el.getBoundingClientRect();
    if (
      next.left >= rowRect.left + margin &&
      next.right <= rowRect.right - margin
    ) {
      return;
    }
    arrow.click();
    setTimeout(step, 320);
  };

  step();
}

export function focusElement(el: HTMLElement): void {
  if (current && current !== el) current.classList.remove(FOCUS_CLASS);

  current = el;
  el.classList.add(FOCUS_CLASS);
  el.focus({ preventScroll: true });
  setRing(el);

  storeFocus(el);
  scrollVertically(el);
  scrollHorizontally(el);
}

export function restoreFocus(): boolean {
  let key: string | null = null;
  try {
    key = sessionStorage.getItem(`${STORAGE_PREFIX}${location.pathname}`);
  } catch {
    return false;
  }
  if (!key) return false;

  for (const el of document.querySelectorAll<HTMLElement>("a[href]")) {
    if (el.getAttribute("href") === key && isVisible(el)) {
      focusElement(el);
      return true;
    }
  }
  return false;
}

/**
 * The cookie banner is a blocking modal on first run. Focus its least
 * invasive button (Reject All) so the controller can dismiss it with A.
 * Returns true while a cookie modal is open.
 */
export function focusModalIfPresent(): boolean {
  const modal = activeModal();
  if (!modal) return false;
  if (current && modal.contains(current)) return true;

  const buttons = [
    ...modal.querySelectorAll<HTMLElement>(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(isVisible);

  const reject = buttons.find((button) =>
    /reject/i.test((button.textContent ?? "").trim()),
  );
  const target = reject ?? buttons[0];
  if (!target) return false;

  focusElement(target);
  return true;
}

function hasVisibleFocus(): boolean {
  const el = getCurrent();
  return !!el && isVisible(el);
}

export function focusInitial(): void {
  if (focusModalIfPresent()) return;
  // Initial focus is called after a delay so late rows can render. By then
  // the user may already be navigating; never yank focus away from a visible
  // element (that shows up as the ring jumping on its own).
  if (hasVisibleFocus()) return;
  if (restoreFocus()) return;

  // Prefer cards. A series page also has a Trailer link outside the episode
  // grid; it should not outrank the episodes just because it is higher up.
  const cardLinks = [
    ...document.querySelectorAll<HTMLElement>(".browse-item-card a[href]"),
  ].filter(isVisible);
  const cards =
    cardLinks.length > 0
      ? cardLinks
      : [...document.querySelectorAll<HTMLElement>('a[href*="/videos/"]')].filter(
          isVisible,
        );

  const onScreen = (el: HTMLElement): boolean => {
    const rect = el.getBoundingClientRect();
    return (
      rect.left >= 0 &&
      rect.left < window.innerWidth * 0.95 &&
      rect.top >= 0 &&
      rect.top < window.innerHeight * 1.3
    );
  };

  // Prefer the topmost row, then the leftmost card in it. Rows can render
  // in a different order than the DOM, and the first card to appear is not
  // necessarily the one the user expects.
  const topmost = cards
    .filter(onScreen)
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const sameRow = Math.abs(ar.top - br.top) < 16;
      return sameRow ? ar.left - br.left : ar.top - br.top;
    })[0];

  const firstVisible =
    topmost ??
    cards.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > 0 && rect.left < window.innerWidth;
    });

  if (firstVisible) {
    focusElement(firstVisible);
    return;
  }

  const candidates = collectFocusables();
  const first =
    candidates.find(({ box }) => box.top >= 0)?.el ?? candidates[0]?.el ?? null;
  if (first) focusElement(first);
}

export function focusSearch(): void {
  if (focusModalIfPresent()) return;

  const input = document.querySelector<HTMLElement>(
    'input.custom-css-search-input, input[type="search"], input[type="text"]',
  );
  if (input) {
    focusElement(input);
    return;
  }
  focusInitial();
}

export function focusLogin(): void {
  if (focusModalIfPresent()) return;

  // The login page switches from email to password without a navigation.
  // Pick whichever input is actually visible so `current` (and the ring)
  // follows the step; without that, D-pad has no starting point.
  const inputs = [
    ...document.querySelectorAll<HTMLElement>(
      '#signin-email-input, #signin-password-input, input[type="email"], input[type="password"]',
    ),
  ].filter(isVisible);

  const target =
    inputs[0] ??
    [...document.querySelectorAll<HTMLElement>("input:not([type=hidden])")].find(
      isVisible,
    ) ??
    null;
  if (!target) return;

  if (getCurrent() === target) {
    target.focus({ preventScroll: true });
    return;
  }
  focusElement(target);
}

/**
 * The site's own back arrow returns from the password step to the email step.
 * B uses it before leaving the login page, so the user can correct an address
 * without losing the flow. Returns false on the email step (nothing to undo).
 */
export function loginBack(): boolean {
  const back = document.querySelector<HTMLElement>(".signin_flow__back-arrow");
  if (!back || !isShown(back)) return false;

  back.click();
  focusLogin();
  return true;
}

export function dismissCookieBanner(): boolean {
  const banner = document.querySelector<HTMLElement>(
    "#ketch-banner, #ketch-consent-banner",
  );
  if (!banner || !isShown(banner)) return false;

  const buttons = [...banner.querySelectorAll<HTMLElement>("button")];
  const reject = buttons.find((button) =>
    /reject/i.test((button.textContent ?? "").trim()),
  );
  (reject ?? buttons[0])?.click();
  return true;
}
