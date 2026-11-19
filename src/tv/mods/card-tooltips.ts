import css from "./card-tooltips.css";
import type { Mod } from "./types";

/** Browse/collection cards show a description tooltip on hover; remove it. */
export const cardTooltips: Mod = {
  id: "card-tooltips",
  pages: ["catalog"],
  css,
};
