import { describe, expect, it } from "vitest";
import { rowTitleFocus } from "../src/tv/mods/row-title-focus";
import type { ModContext } from "../src/tv/mods/types";
import type { Candidate } from "../src/tv/nav";
import { box, nextMutation } from "./helpers";

const ctx = {} as ModContext;

function candidate(el: HTMLElement): Candidate<HTMLElement> {
  return { el, box: box(0, 0) };
}

function headerLink(
  title: string,
  className: string,
  parentClass: string,
): HTMLAnchorElement {
  const header = document.createElement("h1");
  header.className = parentClass;

  const link = document.createElement("a");
  link.href = "/collection";
  link.className = className;
  link.textContent = title;
  header.append(link);
  document.body.append(header);

  return link;
}

describe("row-title-focus", () => {
  it("drops the carousel heading link", () => {
    const title = headerLink(
      "New Releases",
      "site-font-primary-color",
      "head primary horizontal-row-header column",
    );
    const viewAll = headerLink(
      "View all",
      "site-font-primary-color view-more-link",
      "text horizontal-row-header view-more-container column",
    );
    const card = document.createElement("a");
    card.href = "/videos/episode";
    document.body.append(card);

    const found = rowTitleFocus
      .collect!([candidate(title), candidate(viewAll), candidate(card)], ctx)
      .map(({ el }) => el);

    expect(found).toEqual([viewAll, card]);
  });

  it("removes the heading from the tab order and keeps View all", () => {
    const title = headerLink(
      "New Releases",
      "site-font-primary-color",
      "head primary horizontal-row-header column",
    );
    const viewAll = headerLink(
      "View all",
      "site-font-primary-color view-more-link",
      "text horizontal-row-header view-more-container column",
    );

    rowTitleFocus.setup!(ctx);

    expect(title.tabIndex).toBe(-1);
    expect(viewAll.tabIndex).toBe(0);
  });

  it("catches a title that renders after setup", async () => {
    const root = document.createElement("div");
    root.id = "browse-component";
    document.body.append(root);

    rowTitleFocus.setup!(ctx);

    const title = document.createElement("a");
    title.href = "/new-releases";
    const header = document.createElement("h1");
    header.className = "horizontal-row-header";
    header.append(title);
    root.append(header);

    await nextMutation();
    expect(title.tabIndex).toBe(-1);
  });

  it("keeps links outside a row header", () => {
    const link = document.createElement("a");
    link.href = "/series";
    document.body.append(link);

    expect(rowTitleFocus.collect!([candidate(link)], ctx)).toEqual([
      candidate(link),
    ]);
  });

  it("does not need a header to pass candidates through", () => {
    expect(rowTitleFocus.collect!([], ctx)).toEqual([]);
  });
});
