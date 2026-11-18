import { describe, expect, it } from "vitest";
import { chromeless } from "../src/tv/mods/chromeless";
import { nextMutation } from "./helpers";

function iframe(src?: string, id = "watch-embed"): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.id = id;
  if (src !== undefined) frame.setAttribute("src", src);
  document.body.append(frame);
  return frame;
}

describe("chromeless", () => {
  it("does not touch iframes on other pages", () => {
    const frame = iframe("https://embed.vhx.tv/videos/123?autoplay=1");

    chromeless.early!("catalog");

    expect(frame.getAttribute("src")).toBe(
      "https://embed.vhx.tv/videos/123?autoplay=1",
    );
  });

  it("adds the chromeless query parameter before the player loads", () => {
    const frame = iframe("https://embed.vhx.tv/videos/123?autoplay=1&color=abc");

    chromeless.early!("watch");

    const url = new URL(frame.getAttribute("src")!);
    expect(url.searchParams.get("chromeless")).toBe("1");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("color")).toBe("abc");
  });

  it("leaves an already chromeless player alone", () => {
    const src = "https://embed.vhx.tv/videos/123?chromeless=1";
    const frame = iframe(src);

    chromeless.early!("watch");

    expect(frame.getAttribute("src")).toBe(src);
    expect(frame.getAttribute("src")!.match(/chromeless=/g)).toHaveLength(1);
  });

  it("only patches the player iframe and only for Vimeo embeds", () => {
    const otherId = iframe("https://embed.vhx.tv/videos/123", "other-frame");
    const otherHost = iframe("https://example.com/player/123");
    const empty = iframe();

    chromeless.early!("watch");

    expect(otherId.getAttribute("src")).toBe(
      "https://embed.vhx.tv/videos/123",
    );
    expect(otherHost.getAttribute("src")).toBe(
      "https://example.com/player/123",
    );
    expect(empty.hasAttribute("src")).toBe(false);
  });

  it("patches a player inserted later", async () => {
    chromeless.early!("watch");
    const frame = iframe("https://embed.vhx.tv/videos/456?autoplay=1");

    await nextMutation();

    expect(new URL(frame.getAttribute("src")!).searchParams.get("chromeless")).toBe(
      "1",
    );
  });

  it("patches a player nested inside an inserted container", async () => {
    chromeless.early!("watch");

    const container = document.createElement("div");
    container.className = "embed";
    const frame = document.createElement("iframe");
    frame.id = "watch-embed";
    frame.setAttribute("src", "https://embed.vhx.tv/videos/789");
    container.append(frame);
    document.body.append(container);

    await nextMutation();

    expect(new URL(frame.getAttribute("src")!).searchParams.get("chromeless")).toBe(
      "1",
    );
  });
});
