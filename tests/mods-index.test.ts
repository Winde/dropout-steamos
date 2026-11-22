import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODS } from "../src/tv/mods/index";

const ids = MODS.map((mod) => mod.id);

function byId(id: string) {
  const mod = MODS.find((entry) => entry.id === id);
  if (!mod) throw new Error(`missing mod ${id}`);
  return mod;
}

function shippedCss(file: string): string {
  return readFileSync(`src/tv/mods/${file}`, "utf8");
}

describe("mod registry", () => {
  it("has one unique, kebab-case id per mod", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("registers every modification", () => {
    expect([...ids].sort()).toEqual([
      "card-focus",
      "card-tooltips",
      "carousel-edge",
      "catalog-focus",
      "catalog-hero",
      "chromeless",
      "cookie-focus",
      "cookie-reject",
      "cursor",
      "focus-ring",
      "home-back",
      "infinite-scroll",
      "login-back",
      "login-focus",
      "login-magic-link",
      "player",
      "row-title-focus",
      "scrollbars",
      "search-focus",
      "search-shortcut",
      "select-picker",
      "startup-skeleton",
      "updates",
      "watch-frame-title",
      "watch-layout",
    ]);
  });

  it("keeps the player ahead of the other action handlers", () => {
    expect(ids.indexOf("player")).toBeLessThan(ids.indexOf("updates"));
    expect(ids.indexOf("player")).toBeLessThan(ids.indexOf("select-picker"));
    expect(ids.indexOf("player")).toBeLessThan(ids.indexOf("login-back"));
    expect(ids.indexOf("player")).toBeLessThan(ids.indexOf("home-back"));
    expect(ids.indexOf("player")).toBeLessThan(ids.indexOf("search-shortcut"));
  });

  it("lets the update dialog own input before the page's B handlers", () => {
    expect(ids.indexOf("updates")).toBeLessThan(ids.indexOf("login-back"));
    expect(ids.indexOf("updates")).toBeLessThan(ids.indexOf("home-back"));
  });

  it("keeps the update chip off the watch page", () => {
    expect(byId("updates").pages).toEqual(["catalog", "login", "other"]);
  });

  it("scopes mods to the pages they belong to", () => {
    expect(byId("player").pages).toEqual(["watch"]);
    expect(byId("chromeless").pages).toEqual(["watch"]);
    expect(byId("watch-layout").pages).toEqual(["watch"]);
    expect(byId("watch-frame-title").pages).toEqual(["watch"]);
    expect(byId("catalog-hero").pages).toEqual(["catalog"]);
    expect(byId("catalog-focus").pages).toEqual(["catalog"]);
    expect(byId("carousel-edge").pages).toEqual(["catalog"]);
    expect(byId("row-title-focus").pages).toEqual(["catalog"]);
    expect(byId("card-tooltips").pages).toEqual(["catalog"]);
    expect(byId("infinite-scroll").pages).toEqual(["catalog"]);
    expect(byId("search-focus").pages).toEqual(["catalog"]);
    expect(byId("login-focus").pages).toEqual(["login"]);
    expect(byId("login-magic-link").pages).toEqual(["login"]);
    expect(byId("login-back").pages).toEqual(["login"]);
  });

  it("runs the preload patches before the DOM is parsed", () => {
    expect(byId("startup-skeleton").early).toBeTypeOf("function");
    expect(byId("chromeless").early).toBeTypeOf("function");
    expect(byId("cookie-reject").early).toBeTypeOf("function");
  });

  it("keeps the boot skeleton's CSS inside its shadow root", () => {
    // Its class names (.row, .card, .header) are generic. Injecting the file
    // as a page stylesheet would let them collide with the storefront.
    expect(byId("startup-skeleton").css).toBeUndefined();
  });

  it("gives every visual mod its stylesheet", () => {
    for (const id of [
      "focus-ring",
      "cursor",
      "catalog-hero",
      "card-tooltips",
      "scrollbars",
      "watch-layout",
      "updates",
      "row-title-focus",
    ]) {
      // Vitest stubs plain CSS imports, so only the presence of the import is
      // visible here; content is checked from disk below.
      expect(byId(id).css, id).toBeTypeOf("string");
    }
  });
});

describe("site CSS", () => {
  it("draws the focus ring without changing layout", () => {
    const css = shippedCss("focus-ring.css");
    expect(css).toContain(".dropin-focus");
    expect(css).toContain("outline");
  });

  it("hides the pointer while idle", () => {
    const css = shippedCss("cursor.css");
    expect(css).toContain("dropin-hide-cursor");
    expect(css).toContain("cursor: none");
  });

  it("hides only the catalog hero carousel", () => {
    expect(shippedCss("catalog-hero.css")).toContain(
      "html.dropin-catalog .carousel",
    );
  });

  it("hides scrollbars without disabling scrolling", () => {
    const css = shippedCss("scrollbar.css");
    expect(css).toContain("scrollbar-width: none");
    expect(css).not.toContain("overflow: hidden");
  });

  it("makes the watch player fill the viewport", () => {
    const css = shippedCss("watch-player.css");
    expect(css).toContain("html.dropin-watch #watch-player");
    expect(css).toContain("inset: 0");
  });

  it("styles the header version line without competing with Sign In", () => {
    const css = shippedCss("updates.css");
    expect(css).toContain(".dropin-update");
    expect(css).toContain("#bebebb");
    expect(css).toContain("#feea3b");
  });

  it("hides the View all row action", () => {
    const css = shippedCss("row-title-focus.css");
    expect(css).toContain(".horizontal-row-header.view-more-container");
    expect(css).toContain("display: none");
  });

  it("hides card hover tooltips", () => {
    const css = shippedCss("card-tooltips.css");
    expect(css).toContain(".tooltip");
    expect(css).toContain('[data-testid="browse-tooltip"]');
    expect(css).toContain("display: none");
  });

  it("draws a boot skeleton that matches the storefront geometry", () => {
    const css = shippedCss("startup-skeleton.css");
    expect(css).toContain(":host");
    expect(css).toContain("boot-shimmer");
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("aspect-ratio: 2 / 3");
    expect(css).toContain("aspect-ratio: 1 / 1");
    expect(css).toContain("grid-template-columns: repeat(4");
    expect(css).toContain("grid-template-columns: repeat(6");
    expect(css).toContain("@media (min-width: 1920px)");
  });
});
