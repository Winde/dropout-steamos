import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../src/tv/input";
import type { Candidate } from "../src/tv/nav";
import type { Mod, ModContext } from "../src/tv/mods/types";
import { best } from "../src/tv/nav";
import { box, mockRect } from "./helpers";

const mocks = vi.hoisted(() => ({
  collectFocusables: vi.fn(),
  focusElement: vi.fn(),
  focusInitial: vi.fn(),
  getCurrent: vi.fn(),
  setFocusRefiner: vi.fn(),
  mods: [] as Mod[],
}));

vi.mock("../src/tv/focus", () => ({
  collectFocusables: mocks.collectFocusables,
  focusElement: mocks.focusElement,
  focusInitial: mocks.focusInitial,
  getCurrent: mocks.getCurrent,
  setFocusRefiner: mocks.setFocusRefiner,
}));

vi.mock("../src/tv/mods/index", () => ({ MODS: mocks.mods }));

const { applyEarlyMods, startMods } = await import("../src/tv/mods/runtime");

function mod(id: string, partial: Partial<Mod> = {}): Mod {
  return { id, ...partial };
}

function element(left = 0, top = 0, width = 100, height = 60): HTMLElement {
  const el = document.createElement("a");
  el.setAttribute("href", "/target");
  document.body.append(el);
  mockRect(el, left, top, width, height);
  return el;
}

function refiner(): (candidates: Candidate<HTMLElement>[]) => Candidate<HTMLElement>[] {
  const registered = mocks.setFocusRefiner.mock.calls.at(-1)?.[0];
  if (typeof registered !== "function") {
    throw new Error("runtime did not register a focus refiner");
  }
  return registered;
}

beforeEach(() => {
  mocks.collectFocusables.mockReset().mockReturnValue([]);
  mocks.focusElement.mockReset();
  mocks.focusInitial.mockReset();
  mocks.getCurrent.mockReset().mockReturnValue(null);
  mocks.setFocusRefiner.mockReset();
  mocks.mods.length = 0;
  document.body.innerHTML = "";
  for (const style of document.querySelectorAll("style[data-couch-mod]")) {
    style.remove();
  }
  window.history.replaceState({}, "", "/browse");
});

describe("startMods filtering", () => {
  it("activates mods for the page, their extra match, and global mods", () => {
    const setup = vi.fn();
    mocks.mods.push(
      mod("watch-only", { pages: ["watch"], setup }),
      mod("catalog-only", { pages: ["catalog"], setup }),
      mod("global", { setup }),
      mod("matched", {
        pages: ["catalog"],
        match: ({ path }) => path === "/browse",
        setup,
      }),
      mod("not-matched", {
        pages: ["catalog"],
        match: () => false,
        setup,
      }),
    );

    startMods("catalog");

    expect(setup.mock.calls).toHaveLength(3);
    expect(setup.mock.calls.map(([ctx]) => (ctx as ModContext).page)).toEqual([
      "catalog",
      "catalog",
      "catalog",
    ]);
  });

  it("runs setup in registry order with the page and path", () => {
    const order: string[] = [];
    mocks.mods.push(
      mod("first", { setup: (ctx) => order.push(`first:${ctx.path}`) }),
      mod("second", { setup: () => order.push("second") }),
    );

    startMods("catalog");

    expect(order).toEqual(["first:/browse", "second"]);
  });

  it("does not run setup for inactive mods", () => {
    const setup = vi.fn();
    mocks.mods.push(mod("login", { pages: ["login"], setup }));

    startMods("catalog");
    expect(setup).not.toHaveBeenCalled();
  });
});

describe("CSS injection", () => {
  it("injects each mod's CSS as its own style tag", () => {
    mocks.mods.push(
      mod("one", { css: ".one { color: red; }" }),
      mod("two", { css: ".two { color: blue; }" }),
    );

    startMods("catalog");

    const one = document.querySelector<HTMLStyleElement>(
      'style[data-couch-mod="one"]',
    );
    const two = document.querySelector<HTMLStyleElement>(
      'style[data-couch-mod="two"]',
    );
    expect(one?.textContent).toContain(".one");
    expect(two?.textContent).toContain(".two");
    expect(one).not.toBe(two);
  });

  it("does not inject the same style twice", () => {
    mocks.mods.push(mod("once", { css: "a { color: red; }" }));

    startMods("catalog");
    startMods("catalog");

    expect(
      document.querySelectorAll('style[data-couch-mod="once"]'),
    ).toHaveLength(1);
  });

  it("skips mods without CSS and inactive CSS", () => {
    mocks.mods.push(
      mod("none"),
      mod("login", { pages: ["login"], css: "a { color: red; }" }),
    );

    startMods("catalog");

    expect(document.querySelectorAll("style[data-couch-mod]")).toHaveLength(0);
  });

  it("injects before setup so the page already has its styles", () => {
    const seen: boolean[] = [];
    mocks.mods.push(
      mod("styled", {
        css: "a { color: red; }",
        setup: () => {
          seen.push(
            document.querySelector('style[data-couch-mod="styled"]') !== null,
          );
        },
      }),
    );

    startMods("catalog");
    expect(seen).toEqual([true]);
  });
});

describe("focus refiner composition", () => {
  it("composes collectors in registry order", () => {
    const first = element();
    const second = element();
    const extraA = element();
    const extraB = element();

    mocks.mods.push(
      mod("a", {
        collect: (candidates) => [
          ...candidates,
          { el: extraA, box: box(0, 0) },
        ],
      }),
      mod("b", {
        collect: (candidates) => [
          ...candidates,
          { el: extraB, box: box(0, 0) },
        ],
      }),
    );

    startMods("catalog");
    const candidates = [
      { el: first, box: box(0, 0) },
      { el: second, box: box(120, 0) },
    ];

    expect(refiner()(candidates).map(({ el }) => el)).toEqual([
      first,
      second,
      extraA,
      extraB,
    ]);
  });

  it("leaves the list untouched without collectors", () => {
    startMods("catalog");
    const candidates = [{ el: element(), box: box(0, 0) }];
    expect(refiner()(candidates)).toBe(candidates);
  });

  it("ignores collectors from inactive mods", () => {
    const extra = element();
    mocks.mods.push(
      mod("login", {
        pages: ["login"],
        collect: (candidates) => [...candidates, { el: extra, box: box(0, 0) }],
      }),
    );

    startMods("catalog");
    const candidates = [{ el: element(), box: box(0, 0) }];
    expect(refiner()(candidates)).toEqual(candidates);
  });
});

describe("focus", () => {
  it("stops at the first mod that takes focus", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    mocks.mods.push(
      mod("first", { focus: first }),
      mod("second", { focus: second }),
    );

    expect(startMods("catalog").focus()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(mocks.focusInitial).not.toHaveBeenCalled();
  });

  it("tries the next mod when an earlier one declines", () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    mocks.mods.push(
      mod("first", { focus: first }),
      mod("second", { focus: second }),
    );

    expect(startMods("catalog").focus()).toBe(true);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("falls back to initial focus on ordinary pages", () => {
    mocks.mods.push(mod("plain"));
    expect(startMods("other").focus()).toBe(true);
    expect(mocks.focusInitial).toHaveBeenCalledTimes(1);
  });

  it("leaves watch pages to the player when no mod takes focus", () => {
    mocks.mods.push(mod("plain"));
    expect(startMods("watch").focus()).toBe(false);
    expect(mocks.focusInitial).not.toHaveBeenCalled();
  });

  it("does not consult focus mods on other pages", () => {
    const focus = vi.fn(() => true);
    mocks.mods.push(mod("login", { pages: ["login"], focus }));

    startMods("catalog").focus();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("actions", () => {
  it("stops at the first mod that consumes the action", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    mocks.mods.push(
      mod("first", { action: first }),
      mod("second", { action: second }),
    );

    const runtime = startMods("catalog");
    expect(runtime.action("select")).toBe(true);
    expect(first).toHaveBeenCalledWith("select", expect.anything());
    expect(second).not.toHaveBeenCalled();
  });

  it("continues when a mod declines", () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    mocks.mods.push(
      mod("first", { action: first }),
      mod("second", { action: second }),
    );

    const runtime = startMods("catalog");
    expect(runtime.action("back")).toBe(true);
    expect(first).toHaveBeenCalledWith("back", expect.anything());
    expect(second).toHaveBeenCalledWith("back", expect.anything());
  });

  it("reports an unconsumed action", () => {
    const action = vi.fn(() => false);
    mocks.mods.push(mod("pass", { action }));
    expect(startMods("catalog").action("up")).toBe(false);
  });

  it("skips inactive mods", () => {
    const action = vi.fn(() => true);
    mocks.mods.push(mod("login", { pages: ["login"], action }));
    expect(startMods("catalog").action("up")).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});

describe("navigation", () => {
  it("focuses initial when nothing is focused", () => {
    const edge = vi.fn(() => true);
    mocks.mods.push(mod("edge", { edge }));

    startMods("catalog").navigate("right");

    expect(mocks.focusInitial).toHaveBeenCalledTimes(1);
    expect(edge).not.toHaveBeenCalled();
  });

  it("moves to the best spatial candidate", () => {
    const current = element(0, 0);
    const right = element(200, 0);
    const below = element(0, 200);
    mocks.getCurrent.mockReturnValue(current);
    mocks.collectFocusables.mockReturnValue([
      { el: current, box: box(0, 0) },
      { el: right, box: box(200, 0) },
      { el: below, box: box(0, 200) },
    ]);

    startMods("catalog").navigate("right");

    const expected = best(
      current.getBoundingClientRect(),
      [
        { el: right, box: box(200, 0) },
        { el: below, box: box(0, 200) },
      ],
      "right",
    );
    expect(expected).toBe(right);
    expect(mocks.focusElement).toHaveBeenCalledWith(right);
  });

  it("does not consider the current element as a candidate", () => {
    const current = element(0, 0);
    mocks.getCurrent.mockReturnValue(current);
    mocks.collectFocusables.mockReturnValue([
      { el: current, box: box(0, 0) },
    ]);

    startMods("catalog").navigate("right");

    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(mocks.focusInitial).not.toHaveBeenCalled();
  });

  it("offers an unfilled direction to edge mods in order", () => {
    const current = element(0, 0);
    mocks.getCurrent.mockReturnValue(current);
    mocks.collectFocusables.mockReturnValue([
      { el: current, box: box(0, 0) },
    ]);

    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    const third = vi.fn(() => true);
    mocks.mods.push(
      mod("first", { edge: first }),
      mod("second", { edge: second }),
      mod("third", { edge: third }),
    );

    startMods("catalog").navigate("right");

    expect(first).toHaveBeenCalledWith("right", expect.anything());
    expect(second).toHaveBeenCalledWith("right", expect.anything());
    expect(third).not.toHaveBeenCalled();
    expect(mocks.focusElement).not.toHaveBeenCalled();
  });

  it("does nothing when no edge mod claims the direction", () => {
    const current = element(0, 0);
    mocks.getCurrent.mockReturnValue(current);
    mocks.collectFocusables.mockReturnValue([
      { el: current, box: box(0, 0) },
    ]);
    mocks.mods.push(mod("edge", { edge: () => false }));

    expect(() => startMods("catalog").navigate("left")).not.toThrow();
    expect(mocks.focusElement).not.toHaveBeenCalled();
    expect(mocks.focusInitial).not.toHaveBeenCalled();
  });
});

describe("mod context", () => {
  it("delegates to the shared focus and navigation primitives", () => {
    const current = element();
    const target = element(300, 300);
    mocks.getCurrent.mockReturnValue(current);
    let ctx: ModContext | null = null;

    mocks.mods.push(
      mod("consumer", {
        setup: (provided) => {
          ctx = provided;
        },
      }),
    );

    startMods("catalog");

    expect(ctx).not.toBeNull();
    expect(ctx!.page).toBe("catalog");
    expect(ctx!.path).toBe("/browse");
    expect(ctx!.current()).toBe(current);
    ctx!.focus(target);
    expect(mocks.focusElement).toHaveBeenCalledWith(target);
    ctx!.navigate("down");
    expect(mocks.focusInitial).not.toHaveBeenCalled(); // current is visible
  });

  it("lets a mod ask for page focus again", () => {
    let ctx: ModContext | null = null;
    const focus = vi.fn(() => true);
    mocks.mods.push(
      mod("consumer", {
        setup: (provided) => {
          ctx = provided;
        },
      }),
      mod("focuser", { focus }),
    );

    startMods("catalog");
    expect(ctx!.focusPage()).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("applyEarlyMods", () => {
  it("runs early hooks for every mod with the current page kind", () => {
    window.history.replaceState({}, "", "/dimension-20/season:1/videos/episode");
    const early = vi.fn();
    mocks.mods.push(
      mod("one", { early }),
      mod("two", { early: vi.fn() }),
    );

    applyEarlyMods();

    expect(early).toHaveBeenCalledWith("watch");
    expect(mocks.mods[1]?.early).toHaveBeenCalledWith("watch");
  });

  it("detects catalog and login paths before the DOM is ready", () => {
    const early = vi.fn();
    mocks.mods.push(mod("one", { early }));

    window.history.replaceState({}, "", "/login");
    applyEarlyMods();
    expect(early).toHaveBeenLastCalledWith("login");

    window.history.replaceState({}, "", "/dimension-20");
    applyEarlyMods();
    expect(early).toHaveBeenLastCalledWith("catalog");
  });
});
