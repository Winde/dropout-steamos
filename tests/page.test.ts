import { describe, expect, it } from "vitest";
import { pageKind } from "../src/tv/page";

describe("pageKind", () => {
  it("detects login and its subpaths", () => {
    expect(pageKind("/login")).toBe("login");
    expect(pageKind("/login/")).toBe("login");
    expect(pageKind("/login/reset")).toBe("login");
  });

  it("treats login-like names as catalog shows", () => {
    expect(pageKind("/login-help")).toBe("catalog");
    expect(pageKind("/logins")).toBe("catalog");
  });

  it("detects watch pages by the /videos/ segment", () => {
    expect(pageKind("/dimension-20/season:1/videos/episode")).toBe("watch");
    expect(pageKind("/videos/a-trailer")).toBe("watch");
    expect(pageKind("/videos/a-trailer/extra")).toBe("watch");
  });

  it("detects the catalog roots", () => {
    expect(pageKind("/")).toBe("catalog");
    expect(pageKind("/browse")).toBe("catalog");
    expect(pageKind("/series")).toBe("catalog");
  });

  it("detects search pages", () => {
    expect(pageKind("/search")).toBe("catalog");
    expect(pageKind("/search?q=game")).toBe("catalog");
    expect(pageKind("/search/results")).toBe("catalog");
  });

  it("detects show and season pages", () => {
    expect(pageKind("/dimension-20")).toBe("catalog");
    expect(pageKind("/dimension-20/")).toBe("catalog");
    expect(pageKind("/dimension-20/season:3")).toBe("catalog");
    expect(pageKind("/dimension-20/season:3/")).toBe("catalog");
  });

  it("treats any single path segment as a catalog show", () => {
    expect(pageKind("/videos")).toBe("catalog");
    expect(pageKind("/settings")).toBe("catalog");
    expect(pageKind("/some-show/")).toBe("catalog");
  });

  it("leaves deeper, unmodelled pages as other", () => {
    expect(pageKind("/account/settings")).toBe("other");
    expect(pageKind("/dimension-20/season:abc")).toBe("other");
    expect(pageKind("/foo/bar")).toBe("other");
  });

  it("returns other for an empty path", () => {
    expect(pageKind("")).toBe("other");
  });
});
