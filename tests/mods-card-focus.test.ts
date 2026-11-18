import { describe, expect, it } from "vitest";
import { cardFocus } from "../src/tv/mods/card-focus";
import type { ModContext } from "../src/tv/mods/types";
import type { Candidate } from "../src/tv/nav";
import { box } from "./helpers";

const ctx = {} as ModContext;

function collect(candidates: Candidate<HTMLElement>[]): HTMLElement[] {
  return cardFocus.collect!(candidates, ctx).map(({ el }) => el);
}

function card(href: string): { card: HTMLElement; link: HTMLAnchorElement } {
  const element = document.createElement("div");
  element.className = "browse-item-card";
  const link = document.createElement("a");
  link.setAttribute("href", href);
  element.append(link);
  document.body.append(element);
  return { card: element, link };
}

function candidate(
  el: HTMLElement,
  width = 100,
  height = 60,
): Candidate<HTMLElement> {
  return { el, box: box(0, 0, width, height) };
}

describe("cardFocus.collect", () => {
  it("keeps the largest link for a repeated destination in one card", () => {
    const { link } = card("/show");
    const small = candidate(link, 100, 60);
    const large = candidate(link, 300, 180);

    expect(collect([small, large])).toEqual([link]);
    expect(collect([large, small])).toEqual([link]);
  });

  it("keeps the first link when two candidates have the same area", () => {
    const { link } = card("/show");
    const first = candidate(link, 100, 60);
    const second = candidate(link, 100, 60);

    expect(cardFocus.collect!([first, second], ctx)).toEqual([first]);
  });

  it("keeps different destinations in the same card separate", () => {
    const root = document.createElement("div");
    root.className = "browse-item-card";
    document.body.append(root);

    const artwork = document.createElement("a");
    artwork.setAttribute("href", "/show");
    const title = document.createElement("a");
    title.setAttribute("href", "/show/season:1");

    root.append(artwork, title);

    expect(collect([candidate(artwork), candidate(title)])).toEqual([
      artwork,
      title,
    ]);
  });

  it("keeps destinations from different cards separate", () => {
    const first = card("/show");
    const second = card("/show");

    expect(collect([candidate(first.link), candidate(second.link)])).toEqual([
      first.link,
      second.link,
    ]);
  });

  it("passes through candidates outside a card", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);

    expect(collect([candidate(link)])).toEqual([link]);
  });

  it("passes through focusable elements without a destination", () => {
    const { card: root } = card("/show");
    const button = document.createElement("button");
    root.append(button);

    expect(collect([candidate(button)])).toEqual([button]);
  });

  it("appends card candidates after the candidates outside cards", () => {
    const outside = document.createElement("a");
    outside.setAttribute("href", "/outside");
    document.body.append(outside);

    const first = card("/first");
    const second = card("/second");

    expect(
      collect([
        candidate(outside),
        candidate(first.link),
        candidate(second.link),
      ]),
    ).toEqual([outside, first.link, second.link]);
  });
});
