import { beforeEach, describe, expect, it, vi } from "vitest";
import { carouselEdge } from "../src/tv/mods/carousel-edge";
import type { ModContext } from "../src/tv/mods/types";

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

  const arrow = document.createElement("button");
  arrow.className = className;
  row.append(arrow);

  return { row, arrow };
}

function cardInRow(row: HTMLElement): HTMLAnchorElement {
  const card = document.createElement("div");
  card.className = "browse-item-card";
  const link = document.createElement("a");
  link.href = "/videos/episode";
  card.append(link);
  row.append(card);
  return link;
}

function clickSpy(arrow: HTMLElement) {
  const click = vi.fn();
  arrow.addEventListener("click", click);
  return click;
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("carousel-edge", () => {
  it("clicks the right arrow and moves to the revealed card", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(599);
    expect(ctx.navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(ctx.navigate).toHaveBeenCalledWith("right");
  });

  it("clicks the left arrow once the site has shown it", () => {
    const { row, arrow } = rowWithArrow(
      "browse-left-arrow arrow-enter",
    );
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    expect(carouselEdge.edge!("left", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    expect(ctx.navigate).toHaveBeenCalledWith("left");
  });

  it("ignores the hidden left arrow so the row does not loop", () => {
    const { row, arrow } = rowWithArrow("browse-left-arrow");
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    expect(carouselEdge.edge!("left", ctx)).toBe(false);
    expect(click).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it("ignores a disabled arrow", () => {
    const { row, arrow } = rowWithArrow(
      "browse-right-arrow slick-disabled",
    );
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    expect(carouselEdge.edge!("right", ctx)).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves other directions to the page", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

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

  it("clicks once while the row is sliding", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
  });

  it("resets after the row settles", () => {
    const { row, arrow } = rowWithArrow("browse-right-arrow");
    const click = clickSpy(arrow);
    const ctx = context(() => cardInRow(row));

    carouselEdge.edge!("right", ctx);
    vi.advanceTimersByTime(600);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(600);
    expect(ctx.navigate).toHaveBeenCalledTimes(2);
  });

  it("drops the focus move when the user has left the row", () => {
    const { row } = rowWithArrow("browse-right-arrow");
    const card = cardInRow(row);
    const outside = document.createElement("a");
    document.body.append(outside);

    let focused: HTMLElement = card;
    const ctx = context(() => focused);

    expect(carouselEdge.edge!("right", ctx)).toBe(true);
    focused = outside;

    vi.advanceTimersByTime(600);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });
});
