import type { Candidate } from "../nav";
import type { Mod } from "./types";

function area(candidate: Candidate<HTMLElement>): number {
  return candidate.box.width * candidate.box.height;
}

/**
 * One card, one D-pad stop. A card can contain the same link twice (artwork
 * and title); keep the larger one and drop the duplicate. Links with a
 * different destination in the same card stay separate.
 */
export const cardFocus: Mod = {
  id: "card-focus",
  collect(candidates) {
    const out: Candidate<HTMLElement>[] = [];
    const perCard = new Map<
      HTMLElement,
      Map<string, Candidate<HTMLElement>>
    >();

    for (const candidate of candidates) {
      const card = candidate.el.closest<HTMLElement>(".browse-item-card");
      const href = candidate.el.getAttribute("href");
      if (!card || !href) {
        out.push(candidate);
        continue;
      }

      let byHref = perCard.get(card);
      if (!byHref) {
        byHref = new Map();
        perCard.set(card, byHref);
      }

      const existing = byHref.get(href);
      if (!existing || area(candidate) > area(existing)) {
        byHref.set(href, candidate);
      }
    }

    for (const byHref of perCard.values()) out.push(...byHref.values());
    return out;
  },
};
