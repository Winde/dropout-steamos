import { describe, expect, it } from "vitest";
import { watchFrameTitle } from "../src/tv/mods/watch-frame-title";
import type { ModContext } from "../src/tv/mods/types";

const ctx = {} as ModContext;

function frame(id = "watch-embed", title?: string): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.id = id;
  if (title !== undefined) el.setAttribute("title", title);
  document.body.append(el);
  return el;
}

describe("watch-frame-title", () => {
  it("moves the player title to aria-label so Chromium stops showing it", () => {
    const player = frame("watch-embed", "Video Player");

    watchFrameTitle.setup!(ctx);

    expect(player.hasAttribute("title")).toBe(false);
    expect(player.getAttribute("aria-label")).toBe("Video Player");
  });

  it("keeps an existing aria-label", () => {
    const player = frame("watch-embed", "Video Player");
    player.setAttribute("aria-label", "Drop-In player");

    watchFrameTitle.setup!(ctx);

    expect(player.hasAttribute("title")).toBe(false);
    expect(player.getAttribute("aria-label")).toBe("Drop-In player");
  });

  it("leaves other frames alone", () => {
    const other = frame("other-frame", "Something else");

    watchFrameTitle.setup!(ctx);

    expect(other.getAttribute("title")).toBe("Something else");
    expect(other.hasAttribute("aria-label")).toBe(false);
  });

  it("does nothing without a title", () => {
    const player = frame();

    watchFrameTitle.setup!(ctx);

    expect(player.hasAttribute("aria-label")).toBe(false);
  });
});
