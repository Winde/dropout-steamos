import type { Mod } from "./types";

const MAGIC_LINK = "#signin-magic-submit, .signin-flow__password-form-magic-btn";

/**
 * Site change: make the passwordless sign-in link reachable.
 *
 * The site renders "Email me a sign in link" as an <a> without href. Browsers
 * leave such a link out of the tab order, and the TV layer's focusable
 * selector only matches links with a destination. A tab stop plus button
 * semantics puts it back in both paths: Tab reaches it, D-pad navigation
 * collects it, and A/Enter go through the normal select action, which clicks
 * the element and submits the site's magic form.
 */
function prepare(root: ParentNode): void {
  for (const link of root.querySelectorAll<HTMLElement>(MAGIC_LINK)) {
    if (link.hasAttribute("href")) continue;
    if (link.tabIndex < 0) link.tabIndex = 0;
    if (!link.hasAttribute("role")) link.setAttribute("role", "button");
  }
}

export const loginMagicLink: Mod = {
  id: "login-magic-link",
  pages: ["login"],
  setup() {
    // The storefront renders both login steps up front and switches them by
    // class, so the link exists when the mod starts.
    prepare(document);
  },
};
