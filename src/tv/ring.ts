let ring: HTMLElement | null = null;
let target: HTMLElement | null = null;
let raf = 0;

const RING_Z = "2147483647";

function ensureRing(): HTMLElement {
  if (ring) return ring;
  const element = document.createElement("div");
  element.dataset.dropin = "ring";
  element.style.cssText = [
    "position:fixed",
    "pointer-events:none",
    `z-index:${RING_Z}`,
    "opacity:0",
    "border:4px solid #feea3b",
    "border-radius:10px",
    "box-shadow:0 0 0 2px rgba(0,0,0,.75), 0 0 24px rgba(254,234,59,.18)",
    "box-sizing:border-box",
    "transition:opacity 120ms ease",
  ].join(";");
  document.documentElement.appendChild(element);
  ring = element;
  return element;
}

function place(): void {
  if (!ring) return;
  if (!target || !target.isConnected) {
    ring.style.opacity = "0";
    return;
  }

  const card = target.closest<HTMLElement>(".browse-item-card");
  const rect = (card ?? target).getBoundingClientRect();

  if (rect.width < 2 || rect.height < 2) {
    ring.style.opacity = "0";
    return;
  }

  ring.style.opacity = "1";
  ring.style.left = `${Math.round(rect.left - 3)}px`;
  ring.style.top = `${Math.round(rect.top - 3)}px`;
  ring.style.width = `${Math.round(rect.width + 6)}px`;
  ring.style.height = `${Math.round(rect.height + 6)}px`;
}

export function setRing(element: HTMLElement): void {
  target = element;
  ensureRing();
  place();

  // Follow smooth scrolling for a moment, then rely on scroll/resize events.
  cancelAnimationFrame(raf);
  const until = performance.now() + 1000;
  const tick = (): void => {
    place();
    if (performance.now() < until) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function hideRing(): void {
  target = null;
  if (ring) ring.style.opacity = "0";
}

window.addEventListener(
  "scroll",
  () => {
    if (target) place();
  },
  { passive: true },
);

window.addEventListener("resize", () => {
  if (target) place();
});
