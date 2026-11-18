import { afterEach, vi } from "vitest";

// jsdom implements neither scrolling API. The TV layer only needs to know that
// they were called, so a spy is both safer and more useful than a real scroll.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = vi.fn();

// Keep requestAnimationFrame from scheduling work that would outlive a test.
// Tests that need frames (gamepad polling) install their own manual clock.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.documentElement.className = "";
  sessionStorage.clear();
  localStorage.clear();
});
