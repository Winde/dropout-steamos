import type { Action } from "../input";
import type { Candidate, Direction } from "../nav";
import type { PageKind } from "../page";

/** What a mod can reach while it is active on a page. */
export interface ModContext {
  readonly page: PageKind;
  readonly path: string;
  current(): HTMLElement | null;
  focus(el: HTMLElement): void;
  navigate(direction: Direction): void;
  /** Runs the page's focus mods again, e.g. after a modal closes. */
  focusPage(): boolean;
}

/** The parts of the page a mod can use to decide whether it applies. */
export interface ModMatch {
  page: PageKind;
  path: string;
}

export type FocusCollector = (
  candidates: Candidate<HTMLElement>[],
  ctx: ModContext,
) => Candidate<HTMLElement>[];

/**
 * One self-contained change to Dropout or to the TV layer.
 *
 * The array in ./index.ts is the single place where mods are registered. One
 * mod is one independently removable behaviour; if two behaviours can be
 * removed separately, they belong in two mods even when they share a page.
 *
 * A mod may contribute any combination of:
 * - css: a style tag injected as <style data-dropin-mod="id">
 * - early: code that runs in the preload before DOMContentLoaded
 * - setup: listeners or timers started once per page
 * - focus: choose the initial focus
 * - action: consume a controller action (in registry order)
 * - edge: handle a direction when spatial navigation found nothing
 * - collect: refine the focusable list for this page
 */
export interface Mod {
  /** Stable id; also the CSS style tag name. */
  id: string;
  /** Runs in the preload, before the document is ready. */
  early?: (page: PageKind) => void;
  /** Page kinds this mod applies to. Omit for every page. */
  pages?: readonly PageKind[];
  /** Extra page condition, used with pages. */
  match?: (ctx: ModMatch) => boolean;
  /** CSS injected as its own style tag, in registry order. */
  css?: string;
  /** One-time setup for the current page. */
  setup?: (ctx: ModContext) => void;
  /** Choose the initial focus. Return true when the mod took it. */
  focus?: (ctx: ModContext) => boolean | void;
  /** Handle an action. Return true when the mod consumed it. */
  action?: (action: Action, ctx: ModContext) => boolean | void;
  /** Handle a direction when no spatial candidate was found. */
  edge?: (direction: Direction, ctx: ModContext) => boolean | void;
  /** Refine the focusable candidates, in registry order. */
  collect?: FocusCollector;
}
