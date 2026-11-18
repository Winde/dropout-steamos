import { focusLogin } from "../focus";
import type { Mod } from "./types";

/** The login page starts on its visible email/password field. */
export const loginFocus: Mod = {
  id: "login-focus",
  pages: ["login"],
  focus() {
    setTimeout(focusLogin, 400);
    return true;
  },
};
