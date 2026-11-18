export type PageKind = "watch" | "login" | "catalog" | "other";

/**
 * The storefront is server-rendered, so the path is enough to route the TV layer.
 * Catalog covers browse, show, season, series list, and search results.
 */
export function pageKind(pathname: string): PageKind {
  if (pathname === "/login" || pathname.startsWith("/login/")) return "login";
  if (pathname.includes("/videos/")) return "watch";
  if (
    pathname === "/" ||
    pathname === "/browse" ||
    pathname === "/series" ||
    pathname.startsWith("/search") ||
    /^\/[^/]+\/?$/.test(pathname) ||
    /\/season:\d+\/?$/.test(pathname)
  ) {
    return "catalog";
  }
  return "other";
}
