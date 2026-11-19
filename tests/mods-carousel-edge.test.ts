import { beforeEach, describe, expect, it, vi } from "vitest";
import { carouselEdge } from "../src/tv/mods/carousel-edge";
import type { ModContext } from "../src/tv/mods/types";
import type { Candidate } from "../src/tv/nav";
import { box, mockRect } from "./helpers";

const mocks = vi.hoisted(() => ({
  collectFocusables: vi.fn(),
  focusElement: vi.fn(),
}));

vi.mock("../src/tv/focus", () => ({
  collectFocusables: mocks.collectFocusables,
  focusElement: mocks.focusElement,
}));

function context(current: () => HTMLElement | null): ModContext {
  return {
    page: "catalog",
    path: "/browse",
    current,
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage: vi.fn(),
  };
}

function rowWithArrow(className: string): {
  row: HTMLElement;
  arrow: HTMLButtonElement;
} {
  const row = document.createElement("div");
  row.className = "browse-row";
  document.body.append(row);
  mockRect(row, 0, 100, 500, 200);

  const arrow = document.createElement("button");
  arrow.className = className;
  row.append(arrow);

  return { row, arrow };
}

function cardInRow(row: HTMLElement, left = 40): HTMLAnchorElement {
  const card = document.createElement("div");
  card.className = "browse-item-card";
  const link = document.createElement("a");
  link.href = "/videos/episode";
  card.append(link);
  row.append(card);
  mockRect(link, left, 110, 100, 60);
  return link;
}

function nextCard(row: HTMLElement, left: number): HTMLAnchorElement {
  const card = document.createElement("div");
  card.className = "browse-item-card";
  const link = document.createElement("a");
  link.href = "/videos/next";
  card.append(link);
  row.append(card);
  mockRect(link, left, 110, 100, 60);
  return link;
}

function clickSpy(arrow: HTMLElement) {
  const click = vi.fn();
  arrow.addEventListener("click", click);
  return click;
}

function candidate(
  el: HTMLElement,
  left: number,
  top = 110,
  width = 100,
  height = 60,
): Candidate<HTMLElement> {
  mockRect(el, left, top, width, height);
  return { el, box: box(left, top, width, height) };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.collectFocusables.mockReset().mockReturnValue([]);
  mocks.focusElement.mockReset();
});

describe("carousel-edge", () => {
  it("clicks the right arrow and focuses the revealed card", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const current = cardInRow(row);
    const target = nextCard(row, 160);
    mocks.collectFocusables.mockReturnValue([candidate(target, 160)]);

    expect(carouselEdge.edge!("right", context(() => current))).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(mocks.focusElement).toHaveBeenCalledWith(target, { scroll: false });
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
  });

  it("clicks the left arrow once the site has shown it", () => {
    const { row, arrow } = rowWithArrow("browse-left-arrow arrow-enter");
    const click = clickSpy(arrow);
    const current = cardInRow(row, 300);
    const target = nextCard(row, 160);
    mocks.collectFocusables.mockReturnValue([candidate(target, 160)]);

    expect(carouselEdge.edge!("left", context(() => current))).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(carouselEdge.action!("left", context(() => current))).toBe(true);
    expect(carouselEdge.action!("right", context(() => current))).toBe(true);
    expect(carouselEdge.action!("up", context(() => current))).toBe(false);

    vi.advanceTimersByTime(50);
    expect(mocks.focusElement).toHaveBeenCalledWith(target, { scroll: false });
    expect(carouselEdge.action!("left", context(() => current))).toBe(false);
  });

  it("ignores the hidden left arrow so the row does not loop", () => {
    const { row, arrow } = rowWithArrow("browse-left-arrow");
    const click = clickSpy(arrow);
    const current = cardInRow(row);

    expect(carouselEdge.edge!("left", context(() => current))).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("ignores a disabled arrow", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow slick-disabled");
    const click = clickSpy(arrow);
    const current = cardInRow(row);

    expect(carouselEdge.edge!("right", context(() => current))).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves other directions to the page", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const current = cardInRow(row);
    const ctx = context(() => current);

    expect(carouselEdge.edge!("up", ctx)).toBe(false);
    expect(carouselEdge.edge!("down", ctx)).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves non-cards and elements outside a row alone", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    cardInRow(row);
    const click = clickSpy(arrow);

    const heading = document.createElement("a");
    heading.className = "site-font-primary-color";
    row.append(heading);

    expect(carouselEdge.edge!("right", context(() => heading))).toBe(false);
    expect(click).not.toHaveBeenCalled();

    const outside = document.createElement("a");
    document.body.append(outside);
    expect(carouselEdge.edge!("right", context(() => outside))).toBe(false);
  });

  it("waits until the revealed card is fully inside the row", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    clickSpy(arrow);
    const current = cardInRow(row);
    const target = nextCard(row, 600);
    mocks.collectFocusables.mockReturnValue([candidate(target, 600)]);

    expect(carouselEdge.edge!("right", context(() => current))).toBe(true);
    vi.advanceTimersByTime(100);
    expect(mocks.focusElement).not.toHaveBeenCalled();

    mocks.collectFocusables.mockReturnValue([candidate(target, 160)]);
    vi.advanceTimersByTime(50);
    expect(mocks.focusElement).toHaveBeenCalledWith(target, { scroll: false });
  });

  it("clicks once while the row is sliding and resets afterwards", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const current = cardInRow(row);
    const target = nextCard(row, 160);
    mocks.collectFocusables.mockReturnValue([candidate(target, 160)]);
    const ctx = context(() => current);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("gives up and releases the row if the card never settles", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    clickSpy(arrow);
    const current = cardInRow(row);
    const target = nextCard(row, 600);
    mocks.collectFocusables.mockReturnValue([candidate(target, 600)]);

    expect(carouselEdge.edge!("right", context(() => current))).toBe(true);
    vi.advanceTimersByTime(1300);

    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
  });

  it("drops the focus move when the user has left the row", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    clickSpy(arrow);
    const current = cardInRow(row);
    const outside = document.createElement("a");
    document.body.append(outside);
    const target = nextCard(row, 160);
    mocks.collectFocusables.mockReturnValue([candidate(target, 160)]);

    let focused: HTMLElement = current;
    expect(carouselEdge.edge!("right", context(() => focused))).toBe(true);
    focused = outside;

    vi.advanceTimersByTime(50);
    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
  });
});
