export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "back"
  | "menu"
  | "search"
  | "playpause"
  | "seekback"
  | "seekforward"
  | "seekbackmin"
  | "seekforwardmin"
  | "playercontrols"
  | "subtitles"
  | "mute";

interface InputOptions {
  watchMode: boolean;
  onAction: (action: Action) => void;
}

const BUTTON_REPEAT_DELAY = 450;
const BUTTON_REPEAT_INTERVAL = 120;
const AXIS_THRESHOLD = 0.5;

export function isTextInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  // A <select> is navigable chrome, not a text field: D-pad down must leave
  // it instead of changing its value natively.
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

function buttonAction(index: number, watchMode: boolean): Action | null {
  switch (index) {
    case 0:
      return "select";
    case 1:
      return "back";
    case 2:
      return watchMode ? "subtitles" : "search";
    case 3:
      return watchMode ? "playercontrols" : "menu";
    case 4:
    case 5:
      return null;
    case 6:
      return watchMode ? "seekbackmin" : null;
    case 7:
      return watchMode ? "seekforwardmin" : null;
    case 8:
      return "back";
    case 9:
      return watchMode ? "playercontrols" : "menu";
    case 10:
      return "mute";
    case 12:
      return "up";
    case 13:
      return "down";
    case 14:
      return "left";
    case 15:
      return "right";
    default:
      return null;
  }
}

interface Held {
  timeout: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
}

export function startInput(options: InputOptions): () => void {
  let windowFocused = true;
  const held = new Map<string, Held>();

  const emit = (action: Action): void => {
    if (!windowFocused) return;
    // Gamepad actions still reach the TV layer while a text field is focused:
    // D-pad must be able to leave the field (email -> Next, password -> Sign
    // in) and B must still back out. Physical-keyboard events keep their
    // native behaviour below, so arrows still edit text and Backspace still
    // deletes when a real keyboard is attached.
    options.onAction(action);
  };

  const isDirectional = (action: Action): boolean =>
    action === "up" ||
    action === "down" ||
    action === "left" ||
    action === "right";

  const press = (key: string, action: Action): void => {
    if (held.has(key)) return;
    emit(action);

    // Only directions repeat. Holding A should not navigate or toggle twice.
    if (!isDirectional(action)) return;

    const timeout = setTimeout(() => {
      const interval = setInterval(() => emit(action), BUTTON_REPEAT_INTERVAL);
      const entry = held.get(key);
      if (entry) entry.interval = interval;
    }, BUTTON_REPEAT_DELAY);

    held.set(key, { timeout });
  };

  const release = (key: string): void => {
    const entry = held.get(key);
    if (!entry) return;
    clearTimeout(entry.timeout);
    if (entry.interval) clearInterval(entry.interval);
    held.delete(key);
  };

  const releaseAll = (): void => {
    for (const key of [...held.keys()]) release(key);
  };

  // --- gamepad ---------------------------------------------------------

  const buttonState = new Map<number, boolean[]>();
  const axisState = new Map<number, (Action | null)[]>();

  const poll = (): void => {
    const pads = [...navigator.getGamepads()];
    const steamPad = pads.find(
      (pad) =>
        pad &&
        /STANDARD GAMEPAD Vendor: 28de Product: 11ff/.test(pad.id ?? ""),
    );
    const active = steamPad ? [steamPad] : pads.filter((pad) => pad?.connected);

    for (const pad of active) {
      if (!pad) continue;

      const previous = buttonState.get(pad.index) ?? [];
      const next: boolean[] = [];

      for (let i = 0; i < pad.buttons.length; i++) {
        const pressed = pad.buttons[i]?.pressed ?? false;
        next[i] = pressed;
        if (pressed && !previous[i]) {
          const action = buttonAction(i, options.watchMode);
          if (action) press(`b${pad.index}:${i}`, action);
        } else if (!pressed && previous[i]) {
          release(`b${pad.index}:${i}`);
        }
      }
      buttonState.set(pad.index, next);

      const previousAxes = axisState.get(pad.index) ?? [];
      const nextAxes: (Action | null)[] = [];
      const axisMap: Array<{ index: number; neg: Action; pos: Action }> = [
        { index: 0, neg: "left", pos: "right" },
        { index: 1, neg: "up", pos: "down" },
      ];

      for (const { index, neg, pos } of axisMap) {
        const value = pad.axes[index] ?? 0;
        const current =
          value < -AXIS_THRESHOLD ? neg : value > AXIS_THRESHOLD ? pos : null;
        nextAxes[index] = current;

        const key = `a${pad.index}:${index}:${current ?? "none"}`;
        if (current && current !== previousAxes[index]) {
          press(key, current);
        } else if (!current && previousAxes[index]) {
          release(`a${pad.index}:${index}:${previousAxes[index]}`);
        }
      }
      axisState.set(pad.index, nextAxes);
    }

    requestAnimationFrame(poll);
  };

  requestAnimationFrame(poll);

  // --- keyboard --------------------------------------------------------

  const keyboardAction = (event: KeyboardEvent): Action | null => {
    if (options.watchMode) {
      switch (event.key) {
        case "ArrowUp":
          return "up";
        case "ArrowDown":
          return "down";
        case "ArrowLeft":
          return "left";
        case "ArrowRight":
          return "right";
        case "Enter":
        case " ":
          return "select";
        case "y":
        case "Y":
          return "subtitles";
        case "m":
        case "M":
          return "playercontrols";
        case "Escape":
        case "Backspace":
          return "back";
        default:
          return null;
      }
    }

    switch (event.key) {
      case "ArrowUp":
        return "up";
      case "ArrowDown":
        return "down";
      case "ArrowLeft":
        return "left";
      case "ArrowRight":
        return "right";
      case "Enter":
      case " ":
        return "select";
      case "Escape":
      case "Backspace":
        return "back";
      case "y":
      case "Y":
        return "menu";
      case "m":
      case "M":
        return "mute";
      case "/":
        return "search";
      default:
        return null;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Everything except Escape stays native while typing; Backspace must
    // delete, not go back.
    if (isTextInputFocused() && event.key !== "Escape") return;

    const action = keyboardAction(event);
    if (!action) return;
    if (event.repeat && !isDirectional(action)) return;

    event.preventDefault();
    event.stopPropagation();
    emit(action);
  };

  document.addEventListener("keydown", onKeyDown, true);

  const onFocus = (): void => {
    windowFocused = true;
  };
  const onBlur = (): void => {
    windowFocused = false;
    releaseAll();
  };
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    releaseAll();
  };
}
