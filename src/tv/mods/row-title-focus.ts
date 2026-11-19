import type { Mod } from "./types";

const TITLE = ".horizontal-row-header a:not(.view-more-link)";

function dropTabStop(root: ParentNode): void {
  for (const link of root.querySelectorAll<HTMLElement>(TITLE)) {
    if (link.tabIndex !== -1) link.tabIndex = -1;
  }
}

/**
 * Site change: keep carousel headings out of the D-pad path.
 *
 * Each row starts with an <h1><a> that links to the collection page. On a TV
 * the heading labels the row rather than offering a destination, and stopping
 * on it puts a focus ring above the cards. The mod drops the link from the
 * focus candidates and from the tab order. "View all" stays a focus stop, so
 * the collection page is still reachable.
 */
export const rowTitleFocus: Mod = {
  id: "row-title-focus",
  pages: ["catalog"],
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
      ({ el }) => !el.closest(".horizontal-row-header a:not(.view-more-link)"),
    );
  },
};
