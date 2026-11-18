import { session } from "electron";

const LANG = "en-US";
const LOCALE_COOKIES = ["locale", "locale_det"];

/**
 * The storefront follows the locale cookie, Accept-Language, and the
 * locale_det hint. A stale `locale=pt` (from the on-site language switcher)
 * makes the whole app Portuguese, so pin all three to English.
 * The lang switch itself lives in main/index.ts so it applies before ready.
 */
export async function pinEnglish(): Promise<void> {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "*://*.dropout.tv/*",
        "*://*.vhx.tv/*",
        "*://*.vhx.com/*",
        "*://*.vimeo.com/*",
      ],
    },
    (details, callback) => {
      details.requestHeaders["Accept-Language"] = `${LANG},en;q=0.9`;
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  for (const name of LOCALE_COOKIES) {
    await session.defaultSession.cookies.set({
      url: "https://watch.dropout.tv/",
      name,
      value: "en",
      domain: ".dropout.tv",
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "lax",
      expirationDate: Math.floor(Date.now() / 1000) + 31_536_000,
    });
  }
}
