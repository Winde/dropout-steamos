import type { Mod } from "./types";

/** Slick's slide animation runs for 500 ms. */
const SLIDE_MS = 600;
const ADVANCING = "data-dropin-carousel-advancing";

/** Guards the synthetic navigate from claiming the same edge again. */
let settling = false;

function arrowFor(
  row: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  return row.querySelector<HTMLElement>(
    direction === "left" ? ".browse-left-arrow" : ".browse-right-arrow",
  );
}

/**
 * Site change: page a carousel from its visible edge.
 *
 * Slick marks every slide outside the current window `aria-hidden`, so the
 * focus collector has no card past the last visible one. A left/right press at
 * the edge of a row used to do nothing. The mod clicks the site's own arrow,
 * then moves focus to the card that the slide reveals.
 *
 * The left arrow is ignored until the site has shown it (`arrow-enter`):
 * before the first advance it only loops to the end of the row.
 */
export const carouselEdge: Mod = {
  id: "carousel-edge",
  pages: ["catalog"],
  edge(direction, ctx) {
    if (direction !== "left" && direction !== "right") return false;
    if (settling) return true;

    const current = ctx.current();
    if (!current?.closest(".browse-item-card")) return false;
    const row = current.closest<HTMLElement>(".browse-row");
    if (!row) return false;
    if (row.hasAttribute(ADVANCING)) return true;

    const arrow = arrowFor(row, direction);
    if (!arrow || arrow.classList.contains("slick-disabled")) return false;
    if (direction === "left" && !arrow.classList.contains("arrow-enter")) {
      return false;
    }

    row.setAttribute(ADVANCING, "");
    arrow.click();

    setTimeout(() => {
      row.removeAttribute(ADVANCING);

      const focused = ctx.current();
      if (!focused || !row.contains(focused)) return;

      settling = true;
      try {
        ctx.navigate(direction);
      } finally {
        settling = false;
      }
    }, SLIDE_MS);

    return true;
  },
};
