import { focusElement } from "../focus";
import type { Mod, ModContext } from "./types";

/** Slick's slide animation runs for 500 ms. */
const SLIDE_MS = 600;
const ADVANCING = "data-dropin-carousel-advancing";

function arrowFor(
  row: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  return row.querySelector<HTMLElement>(
    direction === "left" ? ".browse-left-arrow" : ".browse-right-arrow",
  );
}

/**
 * The card one slide over from the focused one. Focusing it before the slide
 * starts keeps the ring on the incoming card instead of leaving it on the card
 * that is about to move off-screen.
 */
function nextCard(
  current: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  const slide = current.closest<HTMLElement>(".slick-slide");
  const row = current.closest<HTMLElement>(".browse-row");
  if (!slide || !row) return null;

  const slides = [...row.querySelectorAll<HTMLElement>(".slick-slide")];
  const index = slides.indexOf(slide);
  if (index < 0) return null;

  const offset = direction === "right" ? 1 : -1;
  const target = slides[(index + offset + slides.length) % slides.length];
  return target?.querySelector<HTMLElement>(".browse-item-card a[href]") ?? null;
}

/**
 * Infinite rows page through clones and then reset to the real slides. The
 * card focused at the start of the slide can therefore end up off-screen or
 * hidden. After the slide, keep focus only if the card is really visible; for
 * a wrapped clone, move to the visible slide with the same destination.
 */
function settleFocus(
  row: HTMLElement,
  target: HTMLElement,
  ctx: ModContext,
): boolean {
  const focused = ctx.current();
  if (focused && focused !== target) return true;

  const rowRect = row.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const visible =
    !target.closest('[aria-hidden="true"]') &&
    rect.left >= rowRect.left - 1 &&
    rect.right <= rowRect.right + 1;
  if (visible) return true;

  const href = target.getAttribute("href");
  if (!href) return false;
  const replacement = [
    ...row.querySelectorAll<HTMLElement>(".browse-item-card a[href]"),
  ].find((card) => {
    if (card === target || card.getAttribute("href") !== href) return false;
    if (card.closest('[aria-hidden="true"]')) return false;
    const cardRect = card.getBoundingClientRect();
    return (
      cardRect.left >= rowRect.left - 1 && cardRect.right <= rowRect.right + 1
    );
  });
  if (!replacement) return false;

  focusElement(replacement, { scroll: false });
  return true;
}

/**
 * Site change: page a carousel from its visible edge.
 *
 * Slick marks every slide outside the current window `aria-hidden`, so the
 * focus collector has no card past the last visible one. A left/right press at
 * the edge of a row used to do nothing. The mod clicks the site's own arrow,
 * focuses the card that the slide is bringing in, and ignores directions (and
 * A) until the slide has finished, so repeated presses cannot land focus on a
 * half-visible card. Left at the first slide pages back to the end of the row.
 */
export const carouselEdge: Mod = {
  id: "carousel-edge",
  pages: ["catalog"],
  action(action, ctx) {
    if (
      action !== "up" &&
      action !== "down" &&
      action !== "left" &&
      action !== "right" &&
      action !== "select"
    ) {
      return false;
    }

    const row = ctx.current()?.closest<HTMLElement>(".browse-row");
    return !!row?.hasAttribute(ADVANCING);
  },
  edge(direction, ctx) {
    if (direction !== "left" && direction !== "right") return false;

    const current = ctx.current();
    if (!current?.closest(".browse-item-card")) return false;
    const row = current.closest<HTMLElement>(".browse-row");
    if (!row) return false;
    if (row.hasAttribute(ADVANCING)) return true;

    const arrow = arrowFor(row, direction);
    if (!arrow || arrow.classList.contains("slick-disabled")) return false;

    const target = nextCard(current, direction);
    if (!target) return false;

    row.setAttribute(ADVANCING, "");
    focusElement(target, { scroll: false });
    arrow.click();

    let attempts = 0;
    const finish = (): void => {
      if (!settleFocus(row, target, ctx) && attempts++ < 5) {
        setTimeout(finish, 100);
        return;
      }
      row.removeAttribute(ADVANCING);
    };
    setTimeout(finish, SLIDE_MS);
    return true;
  },
};
