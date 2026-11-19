import { collectFocusables, focusElement } from "../focus";
import { best, type Direction } from "../nav";
import type { Mod, ModContext } from "./types";

const ADVANCING = "data-dropin-carousel-advancing";
const POLL_MS = 50;
const SETTLE_ATTEMPTS = 24;

function arrowFor(
  row: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  return row.querySelector<HTMLElement>(
    direction === "left" ? ".browse-left-arrow" : ".browse-right-arrow",
  );
}

/**
 * Wait for slick to put the revealed card fully inside the row, then focus it
 * without asking the carousel for another nudge. A fixed delay was too early
 * for the taller Trending row and clicked its arrow a second time.
 */
function settle(
  direction: Direction,
  row: HTMLElement,
  ctx: ModContext,
): void {
  let attempts = SETTLE_ATTEMPTS;

  const done = (): void => row.removeAttribute(ADVANCING);

  const tick = (): void => {
    const current = ctx.current();
    if (!current || !row.contains(current)) {
      done();
      return;
    }

    const rowRect = row.getBoundingClientRect();
    const candidates = collectFocusables().filter(
      (candidate) =>
        candidate.el !== current &&
        row.contains(candidate.el) &&
        candidate.el.closest(".browse-item-card"),
    );
    const target = best(
      current.getBoundingClientRect(),
      candidates,
      direction,
    );

    if (target) {
      const rect = target.getBoundingClientRect();
      if (rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1) {
        focusElement(target, { scroll: false });
        done();
        return;
      }
    }

    if (attempts-- <= 0) {
      done();
      return;
    }
    setTimeout(tick, POLL_MS);
  };

  setTimeout(tick, POLL_MS);
}

/**
 * Site change: page a carousel from its visible edge.
 *
 * Slick marks every slide outside the current window `aria-hidden`, so the
 * focus collector has no card past the last visible one. A left/right press at
 * the edge of a row used to do nothing. The mod clicks the site's own arrow,
 * then focuses the revealed card once it has settled.
 *
 * The left arrow is ignored until the site has shown it (`arrow-enter`):
 * before the first advance it only loops to the end of the row.
 */
export const carouselEdge: Mod = {
  id: "carousel-edge",
  pages: ["catalog"],
  action(action, ctx) {
    if (action !== "left" && action !== "right") return false;
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
    if (direction === "left" && !arrow.classList.contains("arrow-enter")) {
      return false;
    }

    row.setAttribute(ADVANCING, "");
    arrow.click();
    settle(direction, row, ctx);

    return true;
  },
};
