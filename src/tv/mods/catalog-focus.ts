import { focusInitial } from "../focus";
import type { Mod } from "./types";

function waitForContent(): void {
  let attempts = 0;
  const timer = setInterval(() => {
    const card = document.querySelector(".browse-item-card a[href]");
    if (card) {
      clearInterval(timer);
      // Give the remaining rows a beat to render before picking the first
      // card; otherwise a late-loading lower row can win.
      setTimeout(focusInitial, 800);
    } else if (attempts++ > 40) {
      clearInterval(timer);
      focusInitial();
    }
  }, 250);
}

/** Delayed initial focus on catalog pages, once the rows have rendered. */
export const catalogFocus: Mod = {
  id: "catalog-focus",
  pages: ["catalog"],
  match: ({ path }) => !path.startsWith("/search"),
  focus() {
    waitForContent();
    return true;
  },
};
