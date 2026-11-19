import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectFocusables,
  dismissCookieBanner,
  focusElement,
  focusInitial,
  focusLogin,
  focusModalIfPresent,
  focusSearch,
  getCurrent,
  loginBack,
  restoreFocus,
  setFocusRefiner,
} from "../src/tv/focus";
import { hideRing } from "../src/tv/ring";
import { mockRect } from "./helpers";

function anchor(
  href: string,
  left = 40,
  top = 40,
  width = 100,
  height = 60,
): HTMLAnchorElement {
  const el = document.createElement("a");
  el.setAttribute("href", href);
  el.textContent = href;
  document.body.append(el);
  mockRect(el, left, top, width, height);
  return el;
}

function button(
  text: string,
  left = 40,
  top = 40,
  width = 100,
  height = 44,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  document.body.append(el);
  mockRect(el, left, top, width, height);
  return el;
}

function card(
  href: string,
  left: number,
  top: number,
  width = 200,
  height = 120,
): HTMLAnchorElement {
  const wrapper = document.createElement("div");
  wrapper.className = "browse-item-card";
  document.body.append(wrapper);

  const el = document.createElement("a");
  el.setAttribute("href", href);
  el.textContent = href;
  wrapper.append(el);
  mockRect(el, left, top, width, height);
  return el;
}

function banner(id = "ketch-banner"): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.append(el);
  mockRect(el, 0, 0, 800, 500);
  return el;
}

function addButton(parent: HTMLElement, text: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  parent.append(el);
  mockRect(el, 100, 100, 140, 44);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  setFocusRefiner((candidates) => candidates);
  hideRing();
});

describe("collectFocusables", () => {
  it("returns visible links, buttons, and fields", () => {
    const link = anchor("/show");
    const control = button("Play");
    const input = document.createElement("input");
    document.body.append(input);
    mockRect(input, 300, 40, 200, 40);

    const found = collectFocusables().map((candidate) => candidate.el);
    expect(found).toEqual([link, control, input]);
  });

  it("skips elements too small to be a card", () => {
    anchor("/tiny", 10, 10, 4, 4);
    const normal = anchor("/normal");
    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      normal,
    ]);
  });

  it("skips hidden, disabled, and removed elements", () => {
    const hiddenDisplay = anchor("/display");
    hiddenDisplay.style.display = "none";

    const hiddenVisibility = anchor("/visibility");
    hiddenVisibility.style.visibility = "hidden";

    const transparent = anchor("/opacity");
    transparent.style.opacity = "0";

    const ariaHidden = document.createElement("div");
    ariaHidden.setAttribute("aria-hidden", "true");
    document.body.append(ariaHidden);
    const insideAria = document.createElement("a");
    insideAria.setAttribute("href", "/aria");
    ariaHidden.append(insideAria);
    mockRect(insideAria, 10, 10);

    const disabled = button("Disabled");
    disabled.disabled = true;

    const negative = document.createElement("div");
    negative.tabIndex = -1;
    negative.textContent = "not focusable";
    document.body.append(negative);
    mockRect(negative, 10, 10);

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    document.body.append(hiddenInput);
    mockRect(hiddenInput, 10, 10);

    const normal = anchor("/normal");
    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      normal,
    ]);
  });

  it("skips carousel chrome and the TV layer's own elements", () => {
    const arrow = document.createElement("button");
    arrow.className = "browse-right-arrow";
    document.body.append(arrow);
    mockRect(arrow, 10, 10, 40, 40);

    const overlay = document.createElement("button");
    overlay.dataset.dropin = "osd";
    document.body.append(overlay);
    mockRect(overlay, 10, 80, 40, 40);

    const normal = button("Play", 10, 140);
    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      normal,
    ]);
  });

  it("scopes navigation to a visible consent modal", () => {
    const modal = banner();
    const inside = addButton(modal, "Reject All");
    anchor("/outside", 900, 900);

    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      inside,
    ]);
  });

  it("ignores a modal with nothing focusable inside", () => {
    banner();
    const outside = anchor("/outside");
    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      outside,
    ]);
  });

  it("uses the first visible modal when both exist", () => {
    const ketch = banner("ketch-banner");
    const first = addButton(ketch, "Reject All");
    const consent = banner("ketch-consent-banner");
    addButton(consent, "Accept");

    expect(collectFocusables().map((candidate) => candidate.el)).toEqual([
      first,
    ]);
  });

  it("applies the refiner registered by the mod runtime", () => {
    const keep = anchor("/keep");
    const drop = anchor("/drop");
    setFocusRefiner((candidates) =>
      candidates.filter((candidate) => candidate.el !== drop),
    );

    const found = collectFocusables().map((candidate) => candidate.el);
    expect(found).toEqual([keep]);
  });
});

describe("getCurrent", () => {
  it("is null before anything is focused", () => {
    expect(getCurrent()).toBeNull();
  });

  it("is null once the focused element leaves the document", () => {
    const link = anchor("/gone");
    focusElement(link);
    expect(getCurrent()).toBe(link);
    link.remove();
    expect(getCurrent()).toBeNull();
  });
});

describe("focusElement", () => {
  it("marks, focuses, and remembers the element", () => {
    const link = anchor("/show");
    focusElement(link);

    expect(link.classList.contains("dropin-focus")).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(getCurrent()).toBe(link);
    expect(
      sessionStorage.getItem(`dropin:focus:${location.pathname}`),
    ).toBe("/show");
  });

  it("moves the focus class from the previous element", () => {
    const first = anchor("/first");
    const second = anchor("/second");
    focusElement(first);
    focusElement(second);

    expect(first.classList.contains("dropin-focus")).toBe(false);
    expect(second.classList.contains("dropin-focus")).toBe(true);
    expect(getCurrent()).toBe(second);
  });

  it("places the focus ring over the target", () => {
    const link = anchor("/show", 20, 30);
    focusElement(link);

    const ring = document.querySelector<HTMLElement>('[data-dropin="ring"]');
    expect(ring).not.toBeNull();
    expect(ring?.style.opacity).toBe("1");
  });

  it("scrolls a card that sits below the safe area", () => {
    const link = anchor("/low", 40, 700);
    focusElement(link);

    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
    const options = vi.mocked(window.scrollTo).mock.calls[0]?.[0] as
      | ScrollToOptions
      | undefined;
    expect(options?.top).toBeCloseTo(700 - window.innerHeight * 0.38);
  });

  it("does not scroll a card already in the safe area", () => {
    const link = anchor("/middle", 40, 300);
    focusElement(link);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls a non-carousel element into view when it overflows sideways", () => {
    const link = anchor("/wide", -40, 100);
    focusElement(link);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does not scroll when the element is fully on screen", () => {
    const link = anchor("/fits", 40, 100);
    focusElement(link);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("clicks the row arrow for a card outside a carousel row", () => {
    vi.useFakeTimers();
    const row = document.createElement("div");
    row.className = "browse-row";
    document.body.append(row);
    mockRect(row, 0, 100, 500, 200);

    const arrow = document.createElement("button");
    arrow.className = "browse-right-arrow";
    row.append(arrow);
    const click = vi.fn();
    arrow.addEventListener("click", click);

    const link = document.createElement("a");
    link.setAttribute("href", "/off-row");
    row.append(link);
    mockRect(link, 600, 120, 100, 60);

    focusElement(link);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(320);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("does nothing when a row has no matching arrow", () => {
    const row = document.createElement("div");
    row.className = "browse-row";
    document.body.append(row);
    mockRect(row, 0, 0, 500, 200);

    const link = document.createElement("a");
    link.setAttribute("href", "/off-row");
    row.append(link);
    mockRect(link, 600, 40, 100, 60);

    expect(() => focusElement(link)).not.toThrow();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("restoreFocus", () => {
  it("returns false without a stored key", () => {
    anchor("/show");
    expect(restoreFocus()).toBe(false);
  });

  it("restores the remembered link for the current path", () => {
    const link = anchor("/dimension-20");
    sessionStorage.setItem(`dropin:focus:${location.pathname}`, "/dimension-20");

    expect(restoreFocus()).toBe(true);
    expect(getCurrent()).toBe(link);
    expect(document.activeElement).toBe(link);
  });

  it("does not restore hidden links", () => {
    const link = anchor("/hidden");
    link.style.display = "none";
    sessionStorage.setItem(`dropin:focus:${location.pathname}`, "/hidden");

    expect(restoreFocus()).toBe(false);
  });

  it("returns false when the remembered link is gone", () => {
    anchor("/something-else");
    sessionStorage.setItem(`dropin:focus:${location.pathname}`, "/missing");
    expect(restoreFocus()).toBe(false);
  });
});

describe("focusInitial", () => {
  it("focuses the reject button while the cookie modal is open", () => {
    const modal = banner();
    addButton(modal, "Accept All");
    const reject = addButton(modal, "Reject All");
    const outside = anchor("/outside", 900, 900);

    focusInitial();
    expect(getCurrent()).toBe(reject);
    expect(getCurrent()).not.toBe(outside);
  });

  it("does not steal focus from an already visible element", () => {
    const current = anchor("/current", 50, 50);
    card("/other", 50, 300);
    focusElement(current);

    focusInitial();
    expect(getCurrent()).toBe(current);
  });

  it("restores remembered focus before choosing a card", () => {
    const remembered = anchor("/remembered", 700, 600);
    const firstCard = card("/first", 10, 100);
    sessionStorage.setItem(`dropin:focus:${location.pathname}`, "/remembered");

    focusInitial();
    expect(getCurrent()).toBe(remembered);
    expect(getCurrent()).not.toBe(firstCard);
  });

  it("picks the topmost row and its leftmost card", () => {
    card("/lower-left", 10, 320);
    card("/top-right", 500, 100);
    const topLeft = card("/top-left", 10, 100);

    focusInitial();
    expect(getCurrent()).toBe(topLeft);
  });

  it("prefers cards over a trailer link higher on the page", () => {
    const trailer = anchor("/dimension-20/videos/trailer", 40, 10);
    const episode = card("/dimension-20/videos/episode-1", 40, 300);

    focusInitial();
    expect(getCurrent()).toBe(episode);
    expect(getCurrent()).not.toBe(trailer);
  });

  it("falls back to video links when the page has no cards", () => {
    const trailer = anchor("/videos/trailer", 40, 40);
    focusInitial();
    expect(getCurrent()).toBe(trailer);
  });

  it("falls back to the first visible focusable", () => {
    const offScreen = anchor("/above", 40, -100);
    const onScreen = button("Menu", 40, 80);

    focusInitial();
    expect(getCurrent()).toBe(onScreen);
    expect(getCurrent()).not.toBe(offScreen);
  });

  it("does nothing when the page has nothing focusable", () => {
    expect(() => focusInitial()).not.toThrow();
    expect(getCurrent()).toBeNull();
  });
});

describe("focusSearch", () => {
  it("focuses the custom search input", () => {
    const input = document.createElement("input");
    input.className = "custom-css-search-input";
    document.body.append(input);
    mockRect(input, 100, 20, 400, 44);

    focusSearch();
    expect(getCurrent()).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it("falls back to a native search input", () => {
    const input = document.createElement("input");
    input.type = "search";
    document.body.append(input);
    mockRect(input, 100, 20, 400, 44);

    focusSearch();
    expect(getCurrent()).toBe(input);
  });

  it("falls back to initial focus when there is no search field", () => {
    const cardLink = card("/show", 40, 100);
    focusSearch();
    expect(getCurrent()).toBe(cardLink);
  });

  it("leaves focus on the cookie modal when it is open", () => {
    const modal = banner();
    const reject = addButton(modal, "Reject All");
    const input = document.createElement("input");
    input.type = "search";
    document.body.append(input);
    mockRect(input, 100, 20, 400, 44);

    focusSearch();
    expect(getCurrent()).toBe(reject);
  });
});

describe("focusLogin", () => {
  it("focuses the email field", () => {
    const email = document.createElement("input");
    email.id = "signin-email-input";
    email.type = "email";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    focusLogin();
    expect(getCurrent()).toBe(email);
  });

  it("follows the site to the visible password field", () => {
    const email = document.createElement("input");
    email.id = "signin-email-input";
    email.type = "email";
    email.style.display = "none";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    const password = document.createElement("input");
    password.id = "signin-password-input";
    password.type = "password";
    document.body.append(password);
    mockRect(password, 100, 100, 400, 44);

    focusLogin();
    expect(getCurrent()).toBe(password);
  });

  it("finds an email input by type when ids differ", () => {
    const email = document.createElement("input");
    email.type = "email";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    focusLogin();
    expect(getCurrent()).toBe(email);
  });

  it("falls back to any visible input", () => {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    document.body.append(hidden);
    mockRect(hidden, 100, 100, 400, 44);

    const fallback = document.createElement("input");
    fallback.type = "text";
    document.body.append(fallback);
    mockRect(fallback, 100, 100, 400, 44);

    focusLogin();
    expect(getCurrent()).toBe(fallback);
  });

  it("does nothing when no field is visible", () => {
    const email = document.createElement("input");
    email.type = "email";
    email.style.display = "none";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    expect(() => focusLogin()).not.toThrow();
    expect(getCurrent()).toBeNull();
  });

  it("does not move focus when the target is already current", () => {
    const email = document.createElement("input");
    email.type = "email";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    focusElement(email);
    const focus = vi.spyOn(email, "focus");
    focusLogin();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(getCurrent()).toBe(email);
  });
});

describe("loginBack", () => {
  it("clicks the site's back arrow on the password step", () => {
    const arrow = document.createElement("button");
    arrow.className = "signin_flow__back-arrow";
    document.body.append(arrow);
    mockRect(arrow, 10, 10, 44, 44);
    const click = vi.fn();
    arrow.addEventListener("click", click);

    const email = document.createElement("input");
    email.type = "email";
    document.body.append(email);
    mockRect(email, 100, 100, 400, 44);

    expect(loginBack()).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(getCurrent()).toBe(email);
  });

  it("returns false on the email step", () => {
    expect(loginBack()).toBe(false);
  });

  it("ignores a hidden back arrow", () => {
    const arrow = document.createElement("button");
    arrow.className = "signin_flow__back-arrow";
    arrow.style.display = "none";
    document.body.append(arrow);
    mockRect(arrow, 10, 10, 44, 44);
    const click = vi.fn();
    arrow.addEventListener("click", click);

    expect(loginBack()).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});

describe("cookie banner", () => {
  it("focuses Reject All when the modal appears", () => {
    const modal = banner();
    addButton(modal, "Accept All");
    const reject = addButton(modal, "Reject All");

    expect(focusModalIfPresent()).toBe(true);
    expect(getCurrent()).toBe(reject);
  });

  it("returns false without a modal", () => {
    expect(focusModalIfPresent()).toBe(false);
  });

  it("leaves focus alone when it is already inside the modal", () => {
    const modal = banner();
    const accept = addButton(modal, "Accept All");
    addButton(modal, "Reject All");

    focusElement(accept);
    expect(focusModalIfPresent()).toBe(true);
    expect(getCurrent()).toBe(accept);
  });

  it("returns false when the modal has no buttons", () => {
    banner();
    expect(focusModalIfPresent()).toBe(false);
  });

  it("dismisses by clicking Reject All", () => {
    const modal = banner();
    const accept = addButton(modal, "Accept All");
    const reject = addButton(modal, "Reject All");
    const acceptClick = vi.fn();
    const rejectClick = vi.fn();
    accept.addEventListener("click", acceptClick);
    reject.addEventListener("click", rejectClick);

    expect(dismissCookieBanner()).toBe(true);
    expect(rejectClick).toHaveBeenCalledTimes(1);
    expect(acceptClick).not.toHaveBeenCalled();
  });

  it("falls back to the first button when there is no reject button", () => {
    const modal = banner();
    const accept = addButton(modal, "Accept All");
    const click = vi.fn();
    accept.addEventListener("click", click);

    expect(dismissCookieBanner()).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("returns false when the banner is absent or hidden", () => {
    expect(dismissCookieBanner()).toBe(false);

    const modal = banner();
    modal.style.display = "none";
    const button = addButton(modal, "Reject All");
    const click = vi.fn();
    button.addEventListener("click", click);

    expect(dismissCookieBanner()).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});

describe("adopting site focus", () => {
  it("adopts a newly focused element", () => {
    const link = anchor("/adopted");
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(link.classList.contains("dropin-focus")).toBe(true);
    expect(getCurrent()).toBe(link);
  });

  it("ignores the TV layer's own elements", () => {
    const own = document.createElement("button");
    own.dataset.dropin = "osd";
    document.body.append(own);
    mockRect(own, 40, 40);
    own.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(own.classList.contains("dropin-focus")).toBe(false);
  });

  it("ignores invisible elements", () => {
    const hidden = anchor("/hidden");
    hidden.style.visibility = "hidden";
    hidden.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(hidden.classList.contains("dropin-focus")).toBe(false);
  });
});
