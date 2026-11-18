import { focusSearch } from "../focus";
import type { Mod } from "./types";

/** The search page starts on its input. */
export const searchFocus: Mod = {
  id: "search-focus",
  pages: ["catalog"],
  match: ({ path }) => path.startsWith("/search"),
  focus() {
    setTimeout(focusSearch, 500);
    return true;
  },
};
