import type { Action } from "../input";
import {
  collectFocusables,
  focusElement,
  focusInitial,
  getCurrent,
  setFocusRefiner,
} from "../focus";
import { best, type Direction } from "../nav";
import { pageKind, type PageKind } from "../page";
import { MODS } from "./index";
import type { Mod, ModContext, ModMatch } from "./types";

export interface ModRuntime {
  /** Offers the action to mods in registry order. True when consumed. */
  action(action: Action): boolean;
  /** Spatial navigation with mods able to claim the edge. */
  navigate(direction: Direction): void;
  /** Runs the page's focus mods; used on entry and after a modal. */
  focus(): boolean;
}

function injectCss(mod: Mod): void {
  if (!mod.css) return;
  if (document.querySelector(`style[data-dropin-mod="${mod.id}"]`)) return;

  const style = document.createElement("style");
  style.dataset.dropinMod = mod.id;
  style.textContent = mod.css;
  document.head.append(style);
}

/** Runs the preload-stage mods before the storefront has parsed. */
export function applyEarlyMods(): void {
  const page = pageKind(location.pathname);
  for (const mod of MODS) mod.early?.(page);
}

/**
 * Applies the registry to one page. This is the only place that knows how
 * mods combine; adding a modification means adding a file and one entry to
 * MODS in ./index.ts.
 */
export function startMods(page: PageKind): ModRuntime {
  const match: ModMatch = { page, path: location.pathname };

  const active = MODS.filter(
    (mod) =>
      (!mod.pages || mod.pages.includes(page)) &&
      (!mod.match || mod.match(match)),
  );

  const ctx: ModContext = {
    page,
    path: location.pathname,
    current: getCurrent,
    focus: focusElement,
    navigate,
    focusPage,
  };

  for (const mod of active) {
    injectCss(mod);
    mod.setup?.(ctx);
  }

  const collectors = active.filter((mod) => mod.collect);
  setFocusRefiner((candidates) => {
    let result = candidates;
    for (const mod of collectors) result = mod.collect!(result, ctx);
    return result;
  });

  function focusPage(): boolean {
    for (const mod of active) {
      if (mod.focus?.(ctx)) return true;
    }

    // Pages without a focus mod (help, settings, checkout) still get a
    // sensible starting point. Watch pages are handled by the player mod.
    if (page !== "watch") {
      focusInitial();
      return true;
    }
    return false;
  }

  function navigate(direction: Direction): void {
    const current = getCurrent();
    if (!current) {
      focusInitial();
      return;
    }

    const from = current.getBoundingClientRect();
    const candidates = collectFocusables().filter(
      (candidate) => candidate.el !== current,
    );
    const next = best(from, candidates, direction);
    if (next) {
      focusElement(next);
      return;
    }

    for (const mod of active) {
      if (mod.edge?.(direction, ctx)) return;
    }
  }

  function action(input: Action): boolean {
    for (const mod of active) {
      if (mod.action?.(input, ctx)) return true;
    }
    return false;
  }

  return { action, navigate, focus: focusPage };
}
