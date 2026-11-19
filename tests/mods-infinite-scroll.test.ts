import { beforeEach, describe, expect, it, vi } from "vitest";
import { infiniteScroll } from "../src/tv/mods/infinite-scroll";
import type { ModContext } from "../src/tv/mods/types";
import type { Candidate } from "../src/tv/nav";
import { box, mockRect } from "./helpers";

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

function row(): HTMLElement {
  const el = document.createElement("div");
  el.className = "browse-row";
  document.body.append(el);
  return el;
}

function cardIn(row: HTMLElement): HTMLAnchorElement {
  const card = document.createElement("div");
  card.className = "browse-item-card";
  const link = document.createElement("a");
  link.href = "/videos/episode";
  card.append(link);
  row.append(card);
  mockRect(link, 0, 0, 100, 60);
  return link;
}

function seeMore(): HTMLButtonElement {
  const more = document.createElement("div");
  more.className = "see-more-row see-more-row--show";
  const center = document.createElement("div");
  center.className = "small-16 text-center";
  const button = document.createElement("button");
  button.textContent = "Show more";
  center.append(button);
  more.append(center);
  document.body.append(more);
  return button;
}

function footerLink(): HTMLAnchorElement {
  const footer = document.createElement("footer");
  footer.className = "footer--site";
  const link = document.createElement("a");
  link.href = "/help";
  link.textContent = "Help";
  footer.append(link);
  document.body.append(footer);
  return link;
}

function candidate(el: HTMLElement): Candidate<HTMLElement> {
  return { el, box: box(0, 0) };
}

function clickSpy(button: HTMLElement): ReturnType<typeof vi.fn> {
  const click = vi.fn();
  button.addEventListener("click", click);
  return click;
}

beforeEach(() => {
  vi.useFakeTimers();
  infiniteScroll.setup!({} as ModContext);
  document.body.innerHTML = "";
});

describe("infinite-scroll", () => {
  it("removes the See more button but keeps footer links focusable", () => {
    const card = cardIn(row());
    const button = seeMore();
    const footer = footerLink();

    const found = infiniteScroll
      .collect!(
        [candidate(card), candidate(button), candidate(footer)],
        {} as ModContext,
      )
      .map(({ el }) => el);

    expect(found).toEqual([card, footer]);
  });

  it("claims down at the last row and clicks Show more without focusing it", () => {
    const current = cardIn(row());
    const button = seeMore();
    const click = clickSpy(button);
    const ctx = context(() => current);

    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    expect(infiniteScroll.action!("select", ctx)).toBe(true);
    expect(infiniteScroll.action!("up", ctx)).toBe(false);
    expect(infiniteScroll.action!("down", ctx)).toBe(false);
  });

  it("moves into the new row once its cards render", () => {
    const first = row();
    const current = cardIn(first);
    seeMore();
    const ctx = context(() => current);

    expect(infiniteScroll.action!("down", ctx)).toBe(true);

    const next = row();
    cardIn(next);

    vi.advanceTimersByTime(100);
    expect(ctx.navigate).toHaveBeenCalledWith("down");
    expect(infiniteScroll.action!("down", ctx)).toBe(false);
  });

  it("waits through a disabled Show more button", () => {
    const current = cardIn(row());
    const button = seeMore();
    button.disabled = true;
    const click = clickSpy(button);
    const ctx = context(() => current);

    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    expect(click).not.toHaveBeenCalled();

    const next = row();
    cardIn(next);

    vi.advanceTimersByTime(100);
    expect(ctx.navigate).toHaveBeenCalledWith("down");
  });

  it("declines when the catalog has no more pages", () => {
    const current = cardIn(row());
    const button = seeMore();
    button.closest(".see-more-row")!.className = "see-more-row see-more-row--hide";
    const click = clickSpy(button);

    expect(infiniteScroll.action!("down", context(() => current))).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("declines when a later row already has a card", () => {
    const first = row();
    const current = cardIn(first);
    const next = row();
    cardIn(next);
    seeMore();

    expect(infiniteScroll.action!("down", context(() => current))).toBe(false);
  });

  it("claims when later rows have no cards yet", () => {
    const first = row();
    const current = cardIn(first);
    row();
    seeMore();

    expect(infiniteScroll.action!("down", context(() => current))).toBe(true);
  });

  it("leaves other actions and non-cards alone", () => {
    const current = cardIn(row());
    const button = seeMore();
    const click = clickSpy(button);
    const ctx = context(() => current);

    expect(infiniteScroll.action!("up", ctx)).toBe(false);
    expect(infiniteScroll.action!("right", ctx)).toBe(false);
    expect(click).not.toHaveBeenCalled();

    const outside = document.createElement("a");
    document.body.append(outside);
    expect(infiniteScroll.action!("down", context(() => outside))).toBe(false);
  });

  it("cancels the waiting move when focus leaves the row", () => {
    const current = cardIn(row());
    seeMore();
    const outside = document.createElement("a");
    document.body.append(outside);

    let focused: HTMLElement = current;
    const ctx = context(() => focused);

    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    focused = outside;

    const next = row();
    cardIn(next);

    vi.advanceTimersByTime(100);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it("allows a retry when the next page never produces a card", () => {
    const current = cardIn(row());
    const button = seeMore();
    const click = clickSpy(button);
    const ctx = context(() => current);

    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(20_000);
    expect(ctx.navigate).not.toHaveBeenCalled();

    expect(infiniteScroll.action!("down", ctx)).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });
});
