import { beforeEach, describe, expect, it, vi } from "vitest";
import { carouselEdge } from "../src/tv/mods/carousel-edge";
import type { ModContext } from "../src/tv/mods/types";
import { mockRect } from "./helpers";

const mocks = vi.hoisted(() => ({
  focusElement: vi.fn(),
}));

vi.mock("../src/tv/focus", () => ({
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

function carousel(count = 4): {
  row: HTMLElement;
  cards: HTMLAnchorElement[];
  left: HTMLButtonElement;
  right: HTMLButtonElement;
} {
  const row = document.createElement("div");
  row.className = "browse-row";
  document.body.append(row);

  const track = document.createElement("div");
  track.className = "slick-track";
  row.append(track);

  const cards = Array.from({ length: count }, (_, index) => {
    const slide = document.createElement("div");
    slide.className = "slick-slide";
    slide.dataset.index = String(index);
    const card = document.createElement("div");
    card.className = "browse-item-card";
    const link = document.createElement("a");
    link.href = `/videos/${index}`;
    link.textContent = `Card ${index}`;
    card.append(link);
    slide.append(card);
    track.append(slide);
    return link;
  });

  const left = document.createElement("button");
  left.className = "browse-left-arrow";
  const right = document.createElement("button");
  right.className = "browse-right-arrow";
  row.append(left, right);

  return { row, cards, left, right };
}

function clickSpy(arrow: HTMLElement) {
  const click = vi.fn();
  arrow.addEventListener("click", click);
  return click;
}

function duplicateCard(
  row: HTMLElement,
  href: string,
  left: number,
): HTMLAnchorElement {
  const card = document.createElement("div");
  card.className = "browse-item-card";
  const link = document.createElement("a");
  link.href = href;
  card.append(link);
  row.append(card);
  mockRect(link, left, 0, 100, 60);
  return link;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.focusElement.mockReset();
});

describe("carousel-edge", () => {
  it("focuses the incoming card before the slide moves", () => {
    const { row, cards, right } = carousel();
    const click = clickSpy(right);
    const ctx = context(() => cards[2]);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(mocks.focusElement).toHaveBeenCalledWith(cards[3], {
      scroll: false,
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(true);
  });

  it("pages left from the first card", () => {
    const { cards, left } = carousel();
    const click = clickSpy(left);
    const ctx = context(() => cards[0]);

    expect(carouselEdge.edge!("left", ctx)).toBe(true);
    expect(mocks.focusElement).toHaveBeenCalledWith(cards[3], {
      scroll: false,
    });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("focuses the previous card when paging left", () => {
    const { cards } = carousel();

    expect(carouselEdge.edge!("left", context(() => cards[2]))).toBe(true);
    expect(mocks.focusElement).toHaveBeenCalledWith(cards[1], {
      scroll: false,
    });
  });

  it("ignores directions and A while the slide is running", () => {
    const { row, cards, right } = carousel();
    clickSpy(right);
    const ctx = context(() => cards[1]);

    carouselEdge.edge!("right", ctx);

    expect(carouselEdge.action!("right", ctx)).toBe(true);
    expect(carouselEdge.action!("left", ctx)).toBe(true);
    expect(carouselEdge.action!("up", ctx)).toBe(true);
    expect(carouselEdge.action!("down", ctx)).toBe(true);
    expect(carouselEdge.action!("select", ctx)).toBe(true);
    expect(carouselEdge.action!("menu", ctx)).toBe(false);
    expect(carouselEdge.action!("search", ctx)).toBe(false);
    expect(carouselEdge.action!("back", ctx)).toBe(false);

    vi.advanceTimersByTime(599);
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
    expect(carouselEdge.action!("right", ctx)).toBe(false);
  });

  it("clicks once while the row is sliding and resets afterwards", () => {
    const { cards, right } = carousel();
    const click = clickSpy(right);
    const ctx = context(() => cards[1]);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("ignores a disabled arrow", () => {
    const { cards, right } = carousel();
    right.classList.add("slick-disabled");
    const click = clickSpy(right);

    expect(carouselEdge.edge!("right", context(() => cards[1]))).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("moves from a wrapped clone to the visible card after the slide", () => {
    const { row, cards } = carousel();
    mockRect(row, 0, 0, 500, 200);
    let focused: HTMLElement = cards[0];
    mocks.focusElement.mockImplementation((el: HTMLElement) => {
      focused = el;
    });
    const ctx = context(() => focused);

    expect(carouselEdge.edge!("left", ctx)).toBe(true);
    expect(focused).toBe(cards[3]);

    mockRect(cards[3], -4000, 0, 100, 60);
    const visible = duplicateCard(row, cards[3].getAttribute("href")!, 300);
    mocks.focusElement.mockClear();

    vi.advanceTimersByTime(600);
    expect(mocks.focusElement).toHaveBeenCalledWith(visible, {
      scroll: false,
    });
    expect(focused).toBe(visible);
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
  });

  it("does not move focus again when the incoming card stays visible", () => {
    const { row, cards } = carousel();
    mockRect(row, 0, 0, 500, 200);
    let focused: HTMLElement = cards[1];
    mocks.focusElement.mockImplementation((el: HTMLElement) => {
      focused = el;
    });
    const ctx = context(() => focused);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    mockRect(cards[2], 300, 0, 100, 60);
    mocks.focusElement.mockClear();

    vi.advanceTimersByTime(600);
    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(focused).toBe(cards[2]);
  });

  it("retries until a wrapped card is visible", () => {
    const { row, cards, left } = carousel();
    mockRect(row, 0, 0, 500, 200);
    let focused: HTMLElement = cards[0];
    mocks.focusElement.mockImplementation((el: HTMLElement) => {
      focused = el;
    });
    const ctx = context(() => focused);
    clickSpy(left);

    expect(carouselEdge.edge!("left", ctx)).toBe(true);
    mockRect(cards[3], -4000, 0, 100, 60);
    mocks.focusElement.mockClear();

    vi.advanceTimersByTime(600);
    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(true);

    const visible = duplicateCard(row, cards[3].getAttribute("href")!, 300);
    vi.advanceTimersByTime(100);
    expect(mocks.focusElement).toHaveBeenCalledWith(visible, {
      scroll: false,
    });
    expect(row.hasAttribute("data-dropin-carousel-advancing")).toBe(false);
  });

  it("leaves other directions to the page", () => {
    const { cards, right } = carousel();
    const click = clickSpy(right);
    const ctx = context(() => cards[1]);

    expect(carouselEdge.edge!("up", ctx)).toBe(false);
    expect(carouselEdge.edge!("down", ctx)).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves non-cards and elements outside a row alone", () => {
    const { row, right } = carousel();
    const click = clickSpy(right);

    const heading = document.createElement("a");
    heading.className = "site-font-primary-color";
    row.append(heading);

    expect(carouselEdge.edge!("right", context(() => heading))).toBe(false);
    expect(click).not.toHaveBeenCalled();

    const outside = document.createElement("a");
    document.body.append(outside);
    expect(carouselEdge.edge!("right", context(() => outside))).toBe(false);
  });
});
