import { describe, expect, it, vi } from "vitest";
import { collectFocusables } from "../src/tv/focus";
import { loginMagicLink } from "../src/tv/mods/login-magic-link";
import type { ModContext } from "../src/tv/mods/types";
import { mockRect } from "./helpers";

function context(): ModContext {
  return {
    page: "login",
    path: "/login",
    current: () => null,
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage: vi.fn(),
  };
}

function magicLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "btn signin-flow__password-form-magic-btn login-black";
  link.textContent = "Email me a sign in link";
  document.body.append(link);
  mockRect(link, 100, 300, 320, 44);
  return link;
}

describe("login-magic-link", () => {
  it("gives the link a tab stop and button semantics", () => {
    const link = magicLink();
    link.id = "signin-magic-submit";

    loginMagicLink.setup!(context());

    expect(link.tabIndex).toBe(0);
    expect(link.getAttribute("role")).toBe("button");
  });

  it("finds the link by its form class", () => {
    const link = magicLink();

    loginMagicLink.setup!(context());

    expect(link.tabIndex).toBe(0);
  });

  it("adds the link to the D-pad's focusable list", () => {
    const link = magicLink();
    expect(collectFocusables().map(({ el }) => el)).not.toContain(link);

    loginMagicLink.setup!(context());

    expect(collectFocusables().map(({ el }) => el)).toContain(link);
  });

  it("leaves a link with a destination alone", () => {
    const link = magicLink();
    link.href = "/login/magic";

    loginMagicLink.setup!(context());

    expect(link.hasAttribute("tabindex")).toBe(false);
    expect(link.hasAttribute("role")).toBe(false);
  });
});
