import { quitApp } from "../quit";
import type { Mod } from "./types";

/** B on Home quits the app. */
export const homeBack: Mod = {
  id: "home-back",
  action(action) {
    if (action !== "back") return false;
    if (location.pathname !== "/browse" && location.pathname !== "/") {
      return false;
    }

    quitApp();
    return true;
  },
};
