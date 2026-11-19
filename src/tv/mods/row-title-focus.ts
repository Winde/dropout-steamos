import css from "./row-title-focus.css";
import type { Mod } from "./types";

const HEADER_LINK = ".horizontal-row-header a";

function dropTabStop(root: ParentNode): void {
  for (const link of root.querySelectorAll<HTMLElement>(HEADER_LINK)) {
    if (link.tabIndex !== -1) link.tabIndex = -1;
  }
}

/**
 * Site change: keep carousel headers out of the D-pad path.
 *
 * Each row starts with an <h1><a> title and a "View all" link that point at the
 * same collection page. On a TV the heading labels the row, and neither link
 * is a destination worth a focus stop; View all also sits on the row's edge,
 * where an edge press belongs to paging. The mod removes both from focus and
 * hides View all completely.
 */
export const rowTitleFocus: Mod = {
  id: "row-title-focus",
  pages: ["catalog"],
  css,
  setup() {
    dropTabStop(document);

    // Rows render after the API responds. Watch the browse root rather than
    // the whole document; fall back to the body on pages with another root.
    const root = document.querySelector("#browse-component") ?? document.body;
    new MutationObserver(() => dropTabStop(root)).observe(root, {
      childList: true,
      subtree: true,
    });
  },
  collect(candidates) {
    return candidates.filter(
      ({ el }) => !el.closest(".horizontal-row-header a"),
    );
  },
};
