import type { Action } from "./input";
import { showHint } from "./hint";
import {
  activateOsd,
  blurOsd,
  focusOsd,
  isOsdFocused,
  moveOsd,
  mountOsd,
  setOsdHandler,
  showOsd,
  updateOsd,
  type OsdControl,
  type PlayerStatus,
} from "./osd";

export interface PlayerControl {
  action(action: Action): void;
}

const PLAYER_ORIGINS = new Set([
  "https://embed.vhx.tv",
  "https://player.vimeo.com",
]);

const pending = new Map<string, (value: unknown) => void>();

const state: PlayerStatus = {
  playing: false,
  time: 0,
  duration: 0,
  subtitlesOn: false,
  muted: false,
};

function frame(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>("#watch-embed");
}

function post(method: string, params: unknown = null): boolean {
  const iframe = frame();
  if (!iframe?.contentWindow) return false;
  iframe.contentWindow.postMessage(JSON.stringify({ method, params }), "*");
  return true;
}

function request(method: string, timeout = 900): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      pending.delete(method);
      resolve(value);
    };

    pending.set(method, finish);
    if (!post(method)) finish(null);
    setTimeout(() => finish(null), timeout);
  });
}

function togglePlay(): void {
  const wasPlaying = state.playing;
  if (!post(wasPlaying ? "pause" : "play")) {
    showHint("Player is not ready", 2000);
    return;
  }

  state.playing = !wasPlaying;
  updateOsd(state);
}

function seek(delta: number): void {
  const target = Math.max(0, state.time + delta);
  if (!post("seekToTime", [target])) {
    showHint("Player is not ready", 2000);
    return;
  }

  state.time = target;
  updateOsd(state);
  showOsd(2500);
}

function back(): void {
  if (history.length > 1) history.back();
  else location.assign("/browse");
}

async function toggleSubtitles(): Promise<void> {
  const raw = await request("getSubtitles");
  let tracks: unknown = raw;

  if (typeof raw === "string") {
    try {
      tracks = JSON.parse(raw);
    } catch {
      tracks = null;
    }
  }

  if (!Array.isArray(tracks) || tracks.length === 0) {
    showHint("No subtitles available", 2000);
    return;
  }

  const list = tracks as Array<{ label?: string; language?: string }>;
  const english =
    list.find((track) =>
      String(track.language ?? "")
        .toLowerCase()
        .startsWith("en"),
    ) ??
    list.find((track) => /english/i.test(track.label ?? "")) ??
    list[0];

  if (!english?.language) {
    showHint("No subtitles available", 2000);
    return;
  }

  if (state.subtitlesOn) {
    post("setSubtitle", [null]);
    state.subtitlesOn = false;
  } else {
    post("setSubtitle", [english.language]);
    state.subtitlesOn = true;
  }

  updateOsd(state);
  showOsd(2500);
}

function toggleMute(): void {
  state.muted = !state.muted;
  post("muted", [state.muted]);
  updateOsd(state);
  showOsd(2500);
}

function executeControl(control: OsdControl): void {
  switch (control) {
    case "play":
      togglePlay();
      break;
    case "subtitles":
      void toggleSubtitles();
      break;
    case "mute":
      toggleMute();
      break;
    case "exit":
      blurOsd();
      back();
      break;
  }
}

export function attachPlayer(): PlayerControl {
  setOsdHandler(executeControl);

  window.addEventListener("message", (event) => {
    if (!PLAYER_ORIGINS.has(event.origin)) return;

    let message: {
      method?: string;
      params?: {
        current_time?: number;
        duration?: number;
        method?: string;
        response?: unknown;
      } | null;
    };

    try {
      message =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }

    if (!message || typeof message.method !== "string") return;

    if (message.method === "response") {
      const method = message.params?.method;
      if (!method) return;
      pending.get(method)?.(message.params?.response ?? null);
      return;
    }

    switch (message.method) {
      case "timeupdate":
        state.time = Number(message.params?.current_time) || 0;
        state.duration =
          Number(message.params?.duration) || state.duration || 0;
        updateOsd(state);
        break;
      case "durationchange":
        state.duration = Number(message.params?.duration) || state.duration;
        updateOsd(state);
        break;
      case "play":
      case "resume":
        state.playing = true;
        updateOsd(state);
        blurOsd(2000);
        break;
      case "pause":
        state.playing = false;
        updateOsd(state);
        showOsd();
        break;
      case "ended":
        state.playing = false;
        updateOsd(state);
        showOsd();
        showHint("Ended · B to go back", 5000);
        break;
      default:
        break;
    }
  });

  // The player iframe and its section are inserted by the storefront after
  // load. Mount the control bar as soon as both exist.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const player = document.querySelector<HTMLElement>("#watch-player");
    if (frame() && player) {
      clearInterval(timer);
      mountOsd(player);
      updateOsd(state);
      void request("muted").then((value) => {
        state.muted = Boolean(value);
        updateOsd(state);
      });
    } else if (attempts > 40) {
      clearInterval(timer);
    }
  }, 250);

  return {
    action(action: Action): void {
      if (isOsdFocused()) {
        switch (action) {
          case "left":
            moveOsd(-1);
            return;
          case "right":
            moveOsd(1);
            return;
          case "up":
          case "down":
          case "back":
          case "playercontrols":
            blurOsd(state.playing ? 2000 : 0);
            return;
          case "select":
          case "playpause": {
            const control = activateOsd();
            if (control) executeControl(control);
            return;
          }
          case "subtitles":
            void toggleSubtitles();
            return;
          case "mute":
            toggleMute();
            return;
          case "seekback":
            seek(-10);
            return;
          case "seekforward":
            seek(10);
            return;
          case "seekbackmin":
            seek(-60);
            return;
          case "seekforwardmin":
            seek(60);
            return;
          default:
            return;
        }
      }

      switch (action) {
        case "left":
          seek(-10);
          break;
        case "right":
          seek(10);
          break;
        case "up":
        case "down":
        case "playercontrols":
          focusOsd();
          break;
        case "select":
        case "playpause":
          togglePlay();
          break;
        case "back":
          back();
          break;
        case "subtitles":
          void toggleSubtitles();
          break;
        case "mute":
          toggleMute();
          break;
        case "seekbackmin":
          seek(-60);
          break;
        case "seekforwardmin":
          seek(60);
          break;
        case "seekback":
          seek(-10);
          break;
        case "seekforward":
          seek(10);
          break;
        default:
          break;
      }
    },
  };
}
