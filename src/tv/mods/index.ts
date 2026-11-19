import { cardFocus } from "./card-focus";
import { carouselEdge } from "./carousel-edge";
import { catalogFocus } from "./catalog-focus";
import { catalogHero } from "./catalog-hero";
import { chromeless } from "./chromeless";
import { cookieFocus } from "./cookie-focus";
import { cookieReject } from "./cookie-reject";
import { cursor } from "./cursor";
import { focusRing } from "./focus-ring";
import { homeBack } from "./home-back";
import { loginBack } from "./login-back";
import { loginFocus } from "./login-focus";
import { loginMagicLink } from "./login-magic-link";
import { player } from "./player";
import { rowTitleFocus } from "./row-title-focus";
import { scrollbars } from "./scrollbars";
import { searchFocus } from "./search-focus";
import { searchShortcut } from "./search-shortcut";
import { selectPicker } from "./select-picker";
import { updates } from "./updates";
import { watchLayout } from "./watch-layout";
import type { Mod } from "./types";

/**
 * The single list of everything Drop-In changes.
 *
 * One mod is one independently removable behaviour. If two behaviours can be
 * removed separately, they belong in two mods even when they share a page.
 *
 * Order is priority:
 * - early() runs in this order before the document parses
 * - action() is offered to each active mod in this order; first true wins
 * - focus() likewise when the page asks for its starting focus
 * - collect() is composed in this order
 * - CSS is injected in this order
 *
 * To add a modification: create a mod file, import it here, add it to the
 * array. To remove one: delete its line.
 */
export const MODS: Mod[] = [
  // Preload patches.
  chromeless,
  cookieReject,

  // Page behaviour. The watch page owns every action, so it comes first.
  player,
  // Before the page's B handlers: the update dialog owns every action while
  // it is open, including the back press that would otherwise leave or quit.
  updates,
  selectPicker,
  cookieFocus,
  loginFocus,
  loginMagicLink,
  loginBack,
  homeBack,
  searchShortcut,

  // Focus and entry behaviour.
  cardFocus,
  rowTitleFocus,
  carouselEdge,
  catalogFocus,
  searchFocus,

  // Visual decorations.
  focusRing,
  cursor,
  catalogHero,
  scrollbars,
  watchLayout,
];
