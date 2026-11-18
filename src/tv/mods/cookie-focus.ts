import { dismissCookieBanner, focusModalIfPresent } from "../focus";
import type { Mod } from "./types";

/** Keep the controller on the cookie modal while it is up, then hand focus back. */
export const cookieFocus: Mod = {
  id: "cookie-focus",
  setup(ctx) {
    let hadModal = false;
    setInterval(() => {
      if (focusModalIfPresent()) {
        hadModal = true;
        return;
      }
      if (!hadModal) return;

      hadModal = false;
      ctx.focusPage();
    }, 700);
  },
  action(action) {
    if (action !== "back") return false;
    return dismissCookieBanner();
  },
};
