import type { Box } from "../src/tv/nav";

/** A layout box centred where a test wants it. */
export function box(
  left: number,
  top: number,
  width = 100,
  height = 60,
): Box {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

/**
 * jsdom has no layout engine: every rectangle is zero-sized, which the TV
 * layer treats as invisible. Tests describe the layout they need.
 */
export function mockRect(
  el: Element,
  left: number,
  top: number,
  width = 100,
  height = 60,
): void {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** Let a MutationObserver's queued callback run. */
export function nextMutation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A manual requestAnimationFrame. The gamepad poll asks for a new frame after
 * every run, so each `frame()` drains exactly the callbacks queued so far.
 */
export function installManualAnimationFrames(): {
  frame(times?: number): void;
  restore(): void;
} {
  let queue: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextId = 1;

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queue.push(callback);
    return nextId++;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

  return {
    frame(times = 1): void {
      for (let i = 0; i < times; i++) {
        const callbacks = queue;
        queue = [];
        for (const callback of callbacks) callback(performance.now());
      }
    },
    restore(): void {
      globalThis.requestAnimationFrame = originalRequest;
      globalThis.cancelAnimationFrame = originalCancel;
      queue = [];
    },
  };
}
