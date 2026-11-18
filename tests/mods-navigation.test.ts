import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogFocus } from "../src/tv/mods/catalog-focus";
import { homeBack } from "../src/tv/mods/home-back";
import { loginBack as loginBackMod } from "../src/tv/mods/login-back";
import { loginFocus } from "../src/tv/mods/login-focus";
import { searchFocus } from "../src/tv/mods/search-focus";
import { searchShortcut } from "../src/tv/mods/search-shortcut";
import { selectPicker } from "../src/tv/mods/select-picker";
import type { ModContext } from "../src/tv/mods/types";

const mocks = vi.hoisted(() => ({
  quitApp: vi.fn(),
  focusLogin: vi.fn(),
  focusInitial: vi.fn(),
  focusSearch: vi.fn(),
  focusElement: vi.fn(),
  loginBack: vi.fn(),
  closePicker: vi.fn(),
  confirmPicker: vi.fn(),
  isPickerOpen: vi.fn(),
  movePicker: vi.fn(),
  openPicker: vi.fn(),
}));

vi.mock("../src/tv/quit", () => ({ quitApp: mocks.quitApp }));
vi.mock("../src/tv/focus", () => ({
  focusLogin: mocks.focusLogin,
  focusInitial: mocks.focusInitial,
  focusSearch: mocks.focusSearch,
  focusElement: mocks.focusElement,
  loginBack: mocks.loginBack,
}));
vi.mock("../src/tv/picker", () => ({
  closePicker: mocks.closePicker,
  confirmPicker: mocks.confirmPicker,
  isPickerOpen: mocks.isPickerOpen,
  movePicker: mocks.movePicker,
  openPicker: mocks.openPicker,
}));

function context(overrides: Partial<ModContext> = {}): ModContext {
  return {
    page: "catalog",
    path: "/browse",
    current: () => null,
    focus: vi.fn(),
    navigate: vi.fn(),
    focusPage: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPickerOpen.mockReturnValue(false);
  mocks.loginBack.mockReturnValue(false);
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/browse");
});

describe("home-back", () => {
  it("quits from the browse page", () => {
    expect(homeBack.action!("back", context())).toBe(true);
    expect(mocks.quitApp).toHaveBeenCalledTimes(1);
  });

  it("quits from the root page", () => {
    window.history.replaceState({}, "", "/");
    expect(homeBack.action!("back", context())).toBe(true);
    expect(mocks.quitApp).toHaveBeenCalledTimes(1);
  });

  it("leaves other pages alone", () => {
    window.history.replaceState({}, "", "/dimension-20");
    expect(homeBack.action!("back", context())).toBe(false);
    expect(mocks.quitApp).not.toHaveBeenCalled();
  });

  it("ignores other actions", () => {
    expect(homeBack.action!("select", context())).toBe(false);
    expect(mocks.quitApp).not.toHaveBeenCalled();
  });
});

describe("search-shortcut", () => {
  it("opens the search page", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, pathname: "/browse" });

    expect(searchShortcut.action!("search", context())).toBe(true);
    expect(assign).toHaveBeenCalledWith("/search");
  });

  it("ignores other actions", () => {
    expect(searchShortcut.action!("select", context())).toBe(false);
  });
});

describe("login-back", () => {
  it("consumes B when the site can step back", () => {
    mocks.loginBack.mockReturnValue(true);
    expect(loginBackMod.action!("back", context())).toBe(true);
    expect(mocks.loginBack).toHaveBeenCalledTimes(1);
  });

  it("lets B leave the page on the email step", () => {
    mocks.loginBack.mockReturnValue(false);
    expect(loginBackMod.action!("back", context())).toBe(false);
  });

  it("ignores other actions", () => {
    expect(loginBackMod.action!("select", context())).toBe(false);
    expect(mocks.loginBack).not.toHaveBeenCalled();
  });
});

describe("login-focus", () => {
  it("focuses the login field after a short delay", () => {
    expect(loginFocus.focus!(context({ page: "login" }))).toBe(true);

    vi.advanceTimersByTime(399);
    expect(mocks.focusLogin).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.focusLogin).toHaveBeenCalledTimes(1);
  });
});

describe("search-focus", () => {
  it("focuses the search input after a short delay", () => {
    expect(searchFocus.focus!(context())).toBe(true);

    vi.advanceTimersByTime(499);
    expect(mocks.focusSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.focusSearch).toHaveBeenCalledTimes(1);
  });

  it("only matches the search path", () => {
    expect(searchFocus.match!({ page: "catalog", path: "/search" })).toBe(true);
    expect(searchFocus.match!({ page: "catalog", path: "/browse" })).toBe(
      false,
    );
  });
});

describe("catalog-focus", () => {
  function addCard(): void {
    const card = document.createElement("div");
    card.className = "browse-item-card";
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    card.append(link);
    document.body.append(card);
  }

  it("only matches non-search catalog pages", () => {
    expect(catalogFocus.match!({ page: "catalog", path: "/browse" })).toBe(true);
    expect(catalogFocus.match!({ page: "catalog", path: "/search" })).toBe(
      false,
    );
  });

  it("waits for the rows to settle, then focuses the first card", () => {
    addCard();
    expect(catalogFocus.focus!(context())).toBe(true);

    vi.advanceTimersByTime(249);
    expect(mocks.focusInitial).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mocks.focusInitial).not.toHaveBeenCalled();

    vi.advanceTimersByTime(799);
    expect(mocks.focusInitial).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.focusInitial).toHaveBeenCalledTimes(1);
  });

  it("keeps polling until the first card appears", () => {
    catalogFocus.focus!(context());
    vi.advanceTimersByTime(250);

    addCard();
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(800);

    expect(mocks.focusInitial).toHaveBeenCalledTimes(1);
  });

  it("focuses something after ten seconds without content", () => {
    catalogFocus.focus!(context());

    vi.advanceTimersByTime(250 * 41);
    expect(mocks.focusInitial).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(mocks.focusInitial).toHaveBeenCalledTimes(1);
  });
});

describe("select-picker", () => {
  it("opens the picker for a focused select", () => {
    const select = document.createElement("select");
    const option = document.createElement("option");
    option.textContent = "Season 1";
    select.append(option);
    document.body.append(select);

    const ctx = context({ current: () => select });
    expect(selectPicker.action!("select", ctx)).toBe(true);
    expect(mocks.focusElement).toHaveBeenCalledWith(select);
    expect(mocks.openPicker).toHaveBeenCalledWith(select);
  });

  it("does not open for other elements or actions", () => {
    const button = document.createElement("button");
    document.body.append(button);

    expect(selectPicker.action!("select", context({ current: () => button })))
      .toBe(false);
    expect(selectPicker.action!("right", context())).toBe(false);
    expect(selectPicker.action!("select", context())).toBe(false);
    expect(mocks.openPicker).not.toHaveBeenCalled();
  });

  it("drives an open picker with the D-pad and buttons", () => {
    mocks.isPickerOpen.mockReturnValue(true);
    const ctx = context();

    expect(selectPicker.action!("up", ctx)).toBe(true);
    expect(mocks.movePicker).toHaveBeenCalledWith(-1);

    expect(selectPicker.action!("down", ctx)).toBe(true);
    expect(mocks.movePicker).toHaveBeenCalledWith(1);

    expect(selectPicker.action!("select", ctx)).toBe(true);
    expect(mocks.confirmPicker).toHaveBeenCalledTimes(1);

    expect(selectPicker.action!("back", ctx)).toBe(true);
    expect(mocks.closePicker).toHaveBeenCalledTimes(1);
  });

  it("swallows every other action while the picker is open", () => {
    mocks.isPickerOpen.mockReturnValue(true);

    expect(selectPicker.action!("menu", context())).toBe(true);
    expect(selectPicker.action!("search", context())).toBe(true);
    expect(mocks.movePicker).not.toHaveBeenCalled();
    expect(mocks.confirmPicker).not.toHaveBeenCalled();
    expect(mocks.closePicker).not.toHaveBeenCalled();
    expect(mocks.openPicker).not.toHaveBeenCalled();
  });
});
