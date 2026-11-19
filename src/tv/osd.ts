import { formatTime } from "./time";

export interface PlayerStatus {
  playing: boolean;
  time: number;
  duration: number;
  subtitlesOn: boolean;
  muted: boolean;
}

export type OsdControl = "play" | "subtitles" | "mute" | "exit";

const CONTROLS: OsdControl[] = ["play", "subtitles", "mute", "exit"];

let host: HTMLElement | null = null;
let bar: HTMLElement | null = null;
let buttons: HTMLButtonElement[] = [];
let timeLabel: HTMLElement | null = null;
let fill: HTMLElement | null = null;
let ccBadge: HTMLElement | null = null;
let muteBadge: HTMLElement | null = null;
let focusIndex = 0;
let focused = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let onControl: ((control: OsdControl) => void) | null = null;

export function setOsdHandler(handler: (control: OsdControl) => void): void {
  onControl = handler;
}

function setFocus(index: number): void {
  focusIndex = index;
  buttons.forEach((button, i) => {
    button.classList.toggle("focus", i === index);
  });
}

function render(status: PlayerStatus): void {
  if (!bar) return;

  if (buttons[0]) buttons[0].textContent = status.playing ? "❚❚" : "▶";
  if (timeLabel) {
    timeLabel.textContent = `${formatTime(status.time)} / ${formatTime(status.duration)}`;
  }
  if (fill) {
    const percent =
      status.duration > 0
        ? Math.min(100, Math.max(0, (status.time / status.duration) * 100))
        : 0;
    fill.style.width = `${percent}%`;
  }
  if (ccBadge) ccBadge.classList.toggle("on", status.subtitlesOn);
  if (muteBadge) muteBadge.classList.toggle("on", status.muted);
}

/**
 * Mounts the bar over the bottom of the player. It is an overlay, not a
 * sibling below the video: the site's own controls live inside the iframe and
 * cannot be styled, so a second permanent bar under the video just duplicates
 * them. This one stays hidden until the user asks for it.
 */
export function mountOsd(anchor: HTMLElement): void {
  if (host?.isConnected) return;

  host = document.createElement("div");
  host.dataset.dropin = "osd";
  host.style.setProperty(
    "--dropin-font",
    getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  );

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 5;
        display: block;
        pointer-events: none;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
        box-sizing: border-box;
        padding: 28px 32px max(18px, 3vh);
        background: linear-gradient(to top, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0));
        color: #fff;
        font: 600 16px/1.2 var(--dropin-font, system-ui, sans-serif);
        opacity: 0;
        visibility: hidden;
        transition: opacity 160ms ease;
      }
      .bar.visible {
        opacity: 1;
        visibility: visible;
      }
      button {
        appearance: none;
        min-width: 44px;
        padding: 9px 13px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #fff;
        font: inherit;
        font-size: 17px;
        line-height: 1;
        pointer-events: auto;
      }
      button:hover { background: rgba(255, 255, 255, 0.08); }
      button.focus {
        outline: 3px solid #feea3b;
        outline-offset: 2px;
        background: rgba(254, 234, 59, 0.14);
      }
      .play { font-size: 20px; }
      .track {
        flex: 1;
        height: 5px;
        overflow: hidden;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.18);
      }
      .fill { height: 100%; width: 0%; background: #feea3b; }
      .time {
        min-width: 12ch;
        color: rgba(255, 255, 255, 0.82);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cc, .mute {
        min-width: 44px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-size: 14px;
        letter-spacing: 0.04em;
        opacity: 0.55;
      }
      .cc.on, .mute.on {
        color: #feea3b;
        border-color: rgba(254, 234, 59, 0.45);
        opacity: 1;
      }
    </style>
    <div class="bar">
      <button class="play" type="button" data-control="play">▶</button>
      <div class="track"><div class="fill"></div></div>
      <span class="time">0:00 / 0:00</span>
      <button class="cc" type="button" data-control="subtitles">CC</button>
      <button class="mute" type="button" data-control="mute">Mute</button>
      <button type="button" data-control="exit">Back</button>
    </div>
  `;

  bar = shadow.querySelector<HTMLElement>(".bar");
  timeLabel = shadow.querySelector<HTMLElement>(".time");
  fill = shadow.querySelector<HTMLElement>(".fill");
  ccBadge = shadow.querySelector<HTMLElement>(".cc");
  muteBadge = shadow.querySelector<HTMLElement>(".mute");

  buttons = [...shadow.querySelectorAll<HTMLButtonElement>(".bar button")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      focusIndex = index;
      setFocus(index);
      const control = CONTROLS[index];
      if (control) onControl?.(control);
    });
  });

  anchor.append(host);
  setFocus(focusIndex);
  showOsd(4000);
}

export function updateOsd(status: PlayerStatus): void {
  render(status);
}

/** Shows the bar; with a timeout it hides itself unless it has focus. */
export function showOsd(autoHideMs = 0): void {
  if (!bar) return;
  if (hideTimer) clearTimeout(hideTimer);
  bar.classList.add("visible");

  if (autoHideMs > 0) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!focused) bar?.classList.remove("visible");
    }, autoHideMs);
  }
}

export function focusOsd(): void {
  if (!host || !bar) return;
  focused = true;
  showOsd();
  setFocus(focusIndex);
}

/** Gives up focus; playing hides the bar shortly, pausing keeps it up. */
export function blurOsd(autoHideMs = 0): void {
  focused = false;
  buttons.forEach((button) => button.classList.remove("focus"));
  if (autoHideMs > 0 && bar?.classList.contains("visible")) {
    showOsd(autoHideMs);
  }
}

export function isOsdFocused(): boolean {
  return focused;
}

export function moveOsd(delta: number): void {
  if (!focused || buttons.length === 0) return;
  setFocus((focusIndex + delta + buttons.length) % buttons.length);
}

export function activateOsd(): OsdControl | null {
  if (!focused) return null;
  return CONTROLS[focusIndex] ?? null;
}
