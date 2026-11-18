import { loginBack as stepBack } from "../focus";
import type { Mod } from "./types";

/** B on the login form returns password -> email, then leaves the page. */
export const loginBack: Mod = {
  id: "login-back",
  pages: ["login"],
  action(action) {
    if (action !== "back") return false;
    return stepBack();
  },
};
