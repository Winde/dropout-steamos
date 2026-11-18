import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTextInputFocused,
  startInput,
  type Action,
} from "../src/tv/input";
import { installManualAnimationFrames } from "./helpers";

let stop: (() => void) | null = null;
let actions: Action[] = [];

function start(watchMode = false): void {
  stop = startInput({
    watchMode,
    onAction: (action) => actions.push(action),
  });
}

function key(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.body.dispatchEvent(event);
  return event;
}

interface FakePad {
  id: string;
  index: number;
  connected: boolean;
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  axes: number[];
}

function pad(overrides: Partial<FakePad> = {}): FakePad {
  return {
    id: "Xbox Wireless Controller",
    index: 0,
    connected: true,
    buttons: Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
    axes: [0, 0, 0, 0],
    ...overrides,
  };
}

function setButton(gamepad: FakePad, index: number, pressed: boolean): void {
  const button = gamepad.buttons[index];
  if (!button) throw new Error(`gamepad has no button ${index}`);
  button.pressed = pressed;
  button.value = pressed ? 1 : 0;
}

function installGamepads(): {
  pads: (FakePad | null)[];
  frame: () => void;
  restore: () => void;
} {
  const frames = installManualAnimationFrames();
  const pads: (FakePad | null)[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "getGamepads");
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => pads,
  });

  return {
    pads,
    frame: () => frames.frame(),
    restore: () => {
      frames.restore();
      if (descriptor) {
        Object.defineProperty(navigator, "getGamepads", descriptor);
      } else {
        delete (navigator as { getGamepads?: unknown }).getGamepads;
      }
    },
  };
}

beforeEach(() => {
  actions = [];
  stop = null;
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe("isTextInputFocused", () => {
  it("is false when the page has focus", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(isTextInputFocused()).toBe(false);
  });

  it("recognises text inputs and textareas", () => {
    const input = document.createElement("input");
    input.type = "email";
    document.body.append(input);
    input.focus();
    expect(isTextInputFocused()).toBe(true);

    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    expect(isTextInputFocused()).toBe(true);
  });

  it("recognises contenteditable elements", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(div, "isContentEditable", { value: true });
    div.tabIndex = 0;
    document.body.append(div);
    div.focus();
    expect(isTextInputFocused()).toBe(true);
  });

  it("does not treat a select as a text field", () => {
    const select = document.createElement("select");
    const option = document.createElement("option");
    option.textContent = "Season 1";
    select.append(option);
    document.body.append(select);
    select.focus();
    expect(isTextInputFocused()).toBe(false);
  });
});

describe("keyboard actions", () => {
  it.each([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["Enter", "select"],
    [" ", "select"],
    ["Escape", "back"],
    ["Backspace", "back"],
    ["y", "menu"],
    ["Y", "menu"],
    ["m", "mute"],
    ["M", "mute"],
    ["/", "search"],
  ] as const)("maps %s to %s", (pressed, expected) => {
    start();
    key(pressed);
    expect(actions).toEqual([expected]);
  });

  it.each([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["Enter", "select"],
    [" ", "select"],
    ["Escape", "back"],
    ["Backspace", "back"],
    ["y", "subtitles"],
    ["m", "playercontrols"],
  ] as const)("maps %s to %s while watching", (pressed, expected) => {
    start(true);
    key(pressed);
    expect(actions).toEqual([expected]);
  });

  it("ignores unmapped keys and leaves them native", () => {
    start();
    for (const pressed of ["a", "q", "Tab", "F11", "PageDown", "/"]) {
      const event = key(pressed);
      if (pressed !== "/") {
        expect(event.defaultPrevented, pressed).toBe(false);
      }
    }
    expect(actions).toEqual(["search"]);
  });

  it("does not map search or menu keys while watching", () => {
    start(true);
    expect(key("/").defaultPrevented).toBe(false);
    expect(key("q").defaultPrevented).toBe(false);
    expect(actions).toEqual([]);
  });

  it("prevents the default action for mapped keys", () => {
    start();
    expect(key("ArrowRight").defaultPrevented).toBe(true);
    expect(key("Enter").defaultPrevented).toBe(true);
  });

  it("ignores shortcuts with ctrl, meta, or alt", () => {
    start();
    key("ArrowRight", { ctrlKey: true });
    key("Enter", { metaKey: true });
    key("Escape", { altKey: true });
    expect(actions).toEqual([]);
  });

  it("still maps shifted keys", () => {
    start();
    key("Enter", { shiftKey: true });
    expect(actions).toEqual(["select"]);
  });

  it("ignores repeated non-directional keydowns", () => {
    start();
    key("Enter", { repeat: true });
    key("Escape", { repeat: true });
    expect(actions).toEqual([]);
  });

  it("accepts repeated directional keydowns", () => {
    start();
    key("ArrowRight", { repeat: true });
    expect(actions).toEqual(["right"]);
  });

  it("leaves typed keys alone but allows Escape to leave a text field", () => {
    start();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const typed = key("ArrowDown");
    expect(typed.defaultPrevented).toBe(false);
    key("Enter");
    key("Backspace");
    expect(actions).toEqual([]);

    const escape = key("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(actions).toEqual(["back"]);
  });

  it("uses the D-pad on a focused select", () => {
    start();
    const select = document.createElement("select");
    const first = document.createElement("option");
    first.textContent = "One";
    const second = document.createElement("option");
    second.textContent = "Two";
    select.append(first, second);
    document.body.append(select);
    select.focus();

    key("ArrowDown");
    expect(actions).toEqual(["down"]);
  });

  it("stops handling keys while the window is blurred", () => {
    start();
    window.dispatchEvent(new Event("blur"));
    key("ArrowRight");
    expect(actions).toEqual([]);

    window.dispatchEvent(new Event("focus"));
    key("ArrowRight");
    expect(actions).toEqual(["right"]);
  });

  it("removes its listeners when stopped", () => {
    start();
    stop?.();
    stop = null;
    key("ArrowRight");
    expect(actions).toEqual([]);
  });
});

describe("gamepad buttons", () => {
  it.each([
    [0, "select"],
    [1, "back"],
    [2, "search"],
    [3, "menu"],
    [4, null],
    [5, null],
    [6, null],
    [7, null],
    [8, "back"],
    [9, "menu"],
    [10, "mute"],
    [11, null],
    [12, "up"],
    [13, "down"],
    [14, "left"],
    [15, "right"],
  ] as const)("maps button %i to %s", (index, expected) => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    setButton(gamepad, index, true);
    gamepads.frame();
    setButton(gamepad, index, false);
    gamepads.frame();

    expect(actions).toEqual(expected ? [expected] : []);
    stop?.();
    stop = null;
    gamepads.restore();
  });

  it.each([
    [2, "subtitles"],
    [3, "playercontrols"],
    [6, "seekbackmin"],
    [7, "seekforwardmin"],
    [9, "playercontrols"],
    [10, "mute"],
  ] as const)("maps button %i to %s while watching", (index, expected) => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start(true);

    setButton(gamepad, index, true);
    gamepads.frame();
    setButton(gamepad, index, false);
    gamepads.frame();

    expect(actions).toEqual([expected]);
    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("prefers the Steam virtual gamepad over other connected pads", () => {
    const gamepads = installGamepads();
    const other = pad({ id: "Xbox Wireless Controller", index: 1 });
    const steam = pad({
      id: "STANDARD GAMEPAD Vendor: 28de Product: 11ff",
      index: 0,
    });
    gamepads.pads.push(other, steam);
    start();

    setButton(other, 0, true);
    gamepads.frame();
    setButton(other, 0, false);
    gamepads.frame();
    expect(actions).toEqual([]);

    setButton(steam, 0, true);
    gamepads.frame();
    expect(actions).toEqual(["select"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("ignores disconnected pads", () => {
    const gamepads = installGamepads();
    const gamepad = pad({ connected: false });
    gamepads.pads.push(gamepad);
    start();

    setButton(gamepad, 0, true);
    gamepads.frame();
    expect(actions).toEqual([]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("still reaches the TV layer while a text field has focus", () => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    setButton(gamepad, 0, true);
    gamepads.frame();
    expect(actions).toEqual(["select"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("repeats held directions but not held face buttons", () => {
    vi.useFakeTimers();
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    setButton(gamepad, 15, true);
    gamepads.frame();
    expect(actions).toEqual(["right"]);

    vi.advanceTimersByTime(449);
    expect(actions).toEqual(["right"]);
    vi.advanceTimersByTime(1);
    expect(actions).toEqual(["right"]);
    vi.advanceTimersByTime(120);
    expect(actions).toEqual(["right", "right"]);
    vi.advanceTimersByTime(240);
    expect(actions).toEqual(["right", "right", "right", "right"]);

    setButton(gamepad, 15, false);
    gamepads.frame();
    vi.advanceTimersByTime(1000);
    expect(actions).toHaveLength(4);

    setButton(gamepad, 0, true);
    gamepads.frame();
    setButton(gamepad, 0, false);
    gamepads.frame();
    expect(actions.at(-1)).toBe("select");
    vi.advanceTimersByTime(2000);
    expect(actions.filter((action) => action === "select")).toHaveLength(1);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("stops repeats when the window loses focus", () => {
    vi.useFakeTimers();
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    setButton(gamepad, 13, true);
    gamepads.frame();
    expect(actions).toEqual(["down"]);

    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);
    expect(actions).toEqual(["down"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("does not emit a second edge while a button stays down", () => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    setButton(gamepad, 0, true);
    gamepads.frame();
    gamepads.frame();
    gamepads.frame();
    expect(actions).toEqual(["select"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });
});

describe("gamepad axes", () => {
  it("maps sticks past the deadzone to directions", () => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    gamepad.axes[0] = 0.6;
    gamepads.frame();
    expect(actions).toEqual(["right"]);

    gamepad.axes[0] = 0;
    gamepads.frame();
    gamepad.axes[0] = -0.6;
    gamepads.frame();
    expect(actions).toEqual(["right", "left"]);

    gamepad.axes[0] = 0;
    gamepads.frame();
    gamepad.axes[1] = 0.7;
    gamepads.frame();
    expect(actions).toEqual(["right", "left", "down"]);

    gamepad.axes[1] = 0;
    gamepads.frame();
    gamepad.axes[1] = -0.7;
    gamepads.frame();
    expect(actions).toEqual(["right", "left", "down", "up"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("ignores movement inside the deadzone", () => {
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    gamepad.axes[0] = 0.5;
    gamepad.axes[1] = -0.5;
    gamepads.frame();
    expect(actions).toEqual([]);

    stop?.();
    stop = null;
    gamepads.restore();
  });

  it("holds and releases an axis direction", () => {
    vi.useFakeTimers();
    const gamepads = installGamepads();
    const gamepad = pad();
    gamepads.pads.push(gamepad);
    start();

    gamepad.axes[0] = 0.8;
    gamepads.frame();
    expect(actions).toEqual(["right"]);

    vi.advanceTimersByTime(450);
    expect(actions).toEqual(["right"]);
    vi.advanceTimersByTime(120);
    expect(actions).toEqual(["right", "right"]);

    gamepad.axes[0] = 0;
    gamepads.frame();
    vi.advanceTimersByTime(1000);
    expect(actions).toEqual(["right", "right"]);

    stop?.();
    stop = null;
    gamepads.restore();
  });
});
