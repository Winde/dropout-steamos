import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onBeforeSendHeaders: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      webRequest: {
        onBeforeSendHeaders: mocks.onBeforeSendHeaders,
      },
      cookies: {
        set: mocks.setCookie,
      },
    },
  },
}));

const { pinEnglish } = await import("../src/main/locale");

interface HeaderDetails {
  requestHeaders: Record<string, string>;
}

interface HeaderFilter {
  urls: string[];
}

function headerListener(): (
  details: HeaderDetails,
  callback: (response: HeaderDetails) => void,
) => void {
  const listener = mocks.onBeforeSendHeaders.mock.calls[0]?.[1];
  if (typeof listener !== "function") {
    throw new Error("header listener was not registered");
  }
  return listener;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setCookie.mockResolvedValue(undefined);
});

describe("pinEnglish", () => {
  it("rewrites Accept-Language for every storefront and player host", async () => {
    await pinEnglish();

    expect(mocks.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    const filter = mocks.onBeforeSendHeaders.mock.calls[0]?.[0] as HeaderFilter;
    expect(filter.urls).toEqual([
      "*://*.dropout.tv/*",
      "*://*.vhx.tv/*",
      "*://*.vhx.com/*",
      "*://*.vimeo.com/*",
    ]);
  });

  it("keeps other request headers intact", async () => {
    await pinEnglish();
    const callback = vi.fn();

    headerListener()(
      {
        requestHeaders: {
          "Accept-Language": "pt-BR,pt;q=0.8",
          "User-Agent": "Drop-In",
        },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Drop-In",
      },
    });
  });

  it("adds the header when the request has none", async () => {
    await pinEnglish();
    const callback = vi.fn();

    headerListener()({ requestHeaders: {} }, callback);

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
  });

  it("pins both locale cookies to English for a year", async () => {
    const before = Math.floor(Date.now() / 1000);
    await pinEnglish();
    const after = Math.floor(Date.now() / 1000);

    expect(mocks.setCookie).toHaveBeenCalledTimes(2);
    const cookies = mocks.setCookie.mock.calls.map(
      ([cookie]) => cookie as Record<string, unknown>,
    );
    expect(cookies.map((cookie) => cookie.name)).toEqual([
      "locale",
      "locale_det",
    ]);

    for (const cookie of cookies) {
      expect(cookie).toMatchObject({
        url: "https://watch.dropout.tv/",
        value: "en",
        domain: ".dropout.tv",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax",
      });
      expect(cookie.expirationDate).toBeGreaterThanOrEqual(
        before + 31_536_000,
      );
      expect(cookie.expirationDate).toBeLessThanOrEqual(after + 31_536_000);
    }
  });

  it("propagates a storage failure", async () => {
    mocks.setCookie.mockRejectedValueOnce(new Error("cookie denied"));

    await expect(pinEnglish()).rejects.toThrow("cookie denied");
    expect(mocks.setCookie).toHaveBeenCalledTimes(1);
  });
});
