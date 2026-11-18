import { beforeEach, describe, expect, it } from "vitest";
import { hideRing, setRing } from "../src/tv/ring";
import { mockRect } from "./helpers";

function ringElement(): HTMLElement {
  const ring = document.querySelector<HTMLElement>('[data-couch="ring"]');
  if (!ring) throw new Error("ring was not created");
  return ring;
}

beforeEach(() => {
  hideRing();
});

describe("focus ring", () => {
  it("creates one fixed, non-interactive overlay", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);
    mockRect(link, 10, 10);

    setRing(link);

    const ring = ringElement();
    expect(ring.dataset.couch).toBe("ring");
    expect(ring.style.position).toBe("fixed");
    expect(ring.style.pointerEvents).toBe("none");
    expect(ring.style.zIndex).toBe("2147483647");
    expect(ring.style.border).toContain("4px solid");
    expect(ring.style.opacity).toBe("1");
  });

  it("reuses the same overlay for every focus", () => {
    const first = document.createElement("a");
    first.setAttribute("href", "/first");
    document.body.append(first);
    mockRect(first, 10, 10);

    const second = document.createElement("a");
    second.setAttribute("href", "/second");
    document.body.append(second);
    mockRect(second, 300, 300);

    setRing(first);
    setRing(second);

    expect(document.querySelectorAll('[data-couch="ring"]')).toHaveLength(1);
  });

  it("surrounds the target with a three-pixel outset", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);
    mockRect(link, 20.4, 30.6, 100.2, 60.4);

    setRing(link);

    const ring = ringElement();
    expect(ring.style.left).toBe("17px");
    expect(ring.style.top).toBe("28px");
    expect(ring.style.width).toBe("106px");
    expect(ring.style.height).toBe("66px");
  });

  it("rings the whole card rather than the inner link", () => {
    const card = document.createElement("div");
    card.className = "browse-item-card";
    document.body.append(card);
    mockRect(card, 100, 200, 300, 180);

    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    card.append(link);
    mockRect(link, 110, 210, 280, 100);

    setRing(link);

    const ring = ringElement();
    expect(ring.style.left).toBe("97px");
    expect(ring.style.top).toBe("197px");
    expect(ring.style.width).toBe("306px");
    expect(ring.style.height).toBe("186px");
  });

  it("hides when the target has no usable size", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/hidden");
    document.body.append(link);
    mockRect(link, 10, 10, 0, 0);

    setRing(link);
    expect(ringElement().style.opacity).toBe("0");
  });

  it("hides when the target is removed and the page scrolls", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/gone");
    document.body.append(link);
    mockRect(link, 10, 10);

    setRing(link);
    expect(ringElement().style.opacity).toBe("1");

    link.remove();
    window.dispatchEvent(new Event("scroll"));
    expect(ringElement().style.opacity).toBe("0");
  });

  it("follows the target when the page scrolls", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);
    mockRect(link, 10, 10);

    setRing(link);
    expect(ringElement().style.left).toBe("7px");

    mockRect(link, 50, 80);
    window.dispatchEvent(new Event("scroll"));

    expect(ringElement().style.left).toBe("47px");
    expect(ringElement().style.top).toBe("77px");
  });

  it("follows the target when the window resizes", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);
    mockRect(link, 10, 10);

    setRing(link);
    mockRect(link, 200, 300, 120, 80);
    window.dispatchEvent(new Event("resize"));

    expect(ringElement().style.left).toBe("197px");
    expect(ringElement().style.top).toBe("297px");
    expect(ringElement().style.width).toBe("126px");
    expect(ringElement().style.height).toBe("86px");
  });

  it("hides on request", () => {
    const link = document.createElement("a");
    link.setAttribute("href", "/show");
    document.body.append(link);
    mockRect(link, 10, 10);

    setRing(link);
    expect(ringElement().style.opacity).toBe("1");

    hideRing();
    expect(ringElement().style.opacity).toBe("0");

    // A scroll with no target must not bring it back.
    window.dispatchEvent(new Event("scroll"));
    expect(ringElement().style.opacity).toBe("0");
  });
});
