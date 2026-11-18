import type { Mod } from "./types";

export const searchShortcut: Mod = {
  id: "search-shortcut",
  action(action) {
    if (action !== "search") return false;

    location.assign("/search");
    return true;
  },
};
