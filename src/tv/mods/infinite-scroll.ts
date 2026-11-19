import { collectFocusables } from "../focus";
import type { Mod, ModContext } from "./types";

const SEE_MORE = ".see-more-row";
const POLL_MS = 100;
const SETTLE_ATTEMPTS = 150;

let loading = false;
let cancelled = false;

function seeMoreButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`${SEE_MORE} button`);
}

/** True when a later row already has a card the D-pad can reach. */
function focusableCardAfter(row: HTMLElement): boolean {
  const rows = [...document.querySelectorAll<HTMLElement>(".browse-row")];
  const index = rows.indexOf(row);
  if (index < 0) return false;

  return collectFocusables().some(({ el }) => {
    const cardRow = el.closest<HTMLElement>(".browse-row");
    return (
      !!el.closest(".browse-item-card") &&
      !!cardRow &&
      rows.indexOf(cardRow) > index &&
      cardRow.isConnected
    );
  });
}

function finish(): void {
  loading = false;
  cancelled = false;
}

/**
 * Start or join the next-page load when there is no card below the current row.
 * Returns false when the catalog has no more pages, so normal navigation can
 * continue to the footer.
 */
function loadNext(ctx: ModContext): boolean {
  const current = ctx.current();
  if (!current?.closest(".browse-item-card")) return false;
  const row = current.closest<HTMLElement>(".browse-row");
  if (!row) return false;
  if (focusableCardAfter(row)) return false;

  const button = seeMoreButton();
  if (!button) return false;
  const container = button.closest(SEE_MORE);
  if (container?.classList.contains("see-more-row--hide")) return false;

  if (!button.disabled) button.click();
  loading = true;
  cancelled = false;

  let attempts = SETTLE_ATTEMPTS;
  const tick = (): void => {
    if (!loading) return;

    const focused = ctx.current();
    if (cancelled || !focused || !row.contains(focused)) {
      finish();
      return;
    }

    if (focusableCardAfter(row)) {
      finish();
      ctx.navigate("down");
      return;
    }

    const more = button.closest(SEE_MORE);
    if (!more || more.classList.contains("see-more-row--hide")) {
      finish();
      return;
    }

    if (attempts-- <= 0) {
      finish();
      return;
    }
    setTimeout(tick, POLL_MS);
  };

  setTimeout(tick, POLL_MS);
  return true;
}

/**
 * Site change: keep focus in the catalog while the next page of rows loads.
 *
 * The next page comes from a .see-more-row button when it reaches the viewport.
 * While it loads there is no card below the current row, so spatial navigation
 * used to fall through to the footer links and leave focus far down the page.
 * The button is removed from the D-pad, and a down press with no focusable card
 * below is claimed here before spatial navigation: it clicks the button without
 * focusing it, keeps focus on the row while the page and its cards arrive, then
 * moves into the first new card. Once the see-more row is exhausted, this
 * declines and the footer can be reached normally.
 */
export const infiniteScroll: Mod = {
  id: "infinite-scroll",
  pages: ["catalog"],
  setup() {
    finish();
  },
  collect(candidates) {
    return candidates.filter(({ el }) => !el.closest(SEE_MORE));
  },
  action(action, ctx) {
    if (loading) {
      if (action === "down" || action === "select") return !cancelled;
      cancelled = true;
      return false;
    }

    if (action !== "down") return false;
    return loadNext(ctx);
  },
};
