import { describe, expect, it } from "vitest";
import { best, score, type Box } from "../src/tv/nav";
import { pageKind } from "../src/tv/page";

function box(left: number, top: number, width = 100, height = 60): Box {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe("score", () => {
  it("accepts a card to the right on the same row", () => {
    expect(score(box(0, 0), box(120, 4), "right")).not.toBeNull();
  });

  it("rejects a card to the left when moving right", () => {
    expect(score(box(200, 0), box(100, 0), "right")).toBeNull();
  });

  it("rejects a card in another row for left/right", () => {
    expect(score(box(0, 0), box(120, 200), "right")).toBeNull();
  });

  it("accepts a card below in a nearby column", () => {
    expect(score(box(0, 0), box(10, 120), "down")).not.toBeNull();
  });
});

describe("best", () => {
  it("picks the nearest same-row card", () => {
    const from = box(0, 0);
    const near = { el: "near", box: box(120, 0) };
    const far = { el: "far", box: box(300, 0) };
    expect(best(from, [near, far], "right")).toBe("near");
  });

  it("prefers the same column when moving down", () => {
    const from = box(0, 0);
    const sameColumn = { el: "same", box: box(0, 120) };
    const farRight = { el: "far", box: box(600, 120) };
    expect(best(from, [sameColumn, farRight], "down")).toBe("same");
  });
});

describe("pageKind", () => {
  it("detects a watch page", () => {
    expect(pageKind("/dimension-20/season:1/videos/episode")).toBe("watch");
  });

  it("detects a standalone video", () => {
    expect(pageKind("/videos/a-trailer")).toBe("watch");
  });

  it("detects a show page", () => {
    expect(pageKind("/dimension-20")).toBe("catalog");
  });

  it("detects a season page", () => {
    expect(pageKind("/dimension-20/season:3")).toBe("catalog");
  });

  it("detects login", () => {
    expect(pageKind("/login")).toBe("login");
  });

  it("detects browse", () => {
    expect(pageKind("/browse")).toBe("catalog");
  });

  it("detects search", () => {
    expect(pageKind("/search?q=game")).toBe("catalog");
  });
});

describe("score details", () => {
  it("requires more than four pixels of movement", () => {
    const from = box(0, 0);
    expect(score(from, box(4, 0), "right")).toBeNull();
    expect(score(from, box(5, 0), "right")).not.toBeNull();
  });

  it("rejects left/right candidates that are not on the same row", () => {
    const from = box(0, 0, 100, 60);
    // Centres are 32px apart; the row tolerance is 55% of 60px (33px).
    expect(score(from, box(120, 32), "right")).not.toBeNull();
    expect(score(from, box(120, 34), "right")).toBeNull();
  });

  it("weights perpendicular distance more heavily than forward distance", () => {
    const from = box(0, 0);
    const to = box(120, 10);
    // primary 120, perpendicular 10, cost = 120 + 10 * 2.5
    expect(score(from, to, "right")).toBeCloseTo(145);
  });

  it("prices up/down movement by horizontal offset", () => {
    const from = box(0, 0);
    const below = box(10, 120);
    expect(score(from, below, "down")).toBeCloseTo(145);
  });

  it("accepts candidates in each direction", () => {
    const from = box(100, 100);
    expect(score(from, box(250, 100), "right")).not.toBeNull();
    expect(score(from, box(0, 100), "left")).not.toBeNull();
    expect(score(from, box(100, 250), "down")).not.toBeNull();
    expect(score(from, box(100, 0), "up")).not.toBeNull();
  });

  it("rejects candidates behind the movement", () => {
    const from = box(100, 100);
    expect(score(from, box(0, 100), "right")).toBeNull();
    expect(score(from, box(250, 100), "left")).toBeNull();
    expect(score(from, box(100, 0), "down")).toBeNull();
    expect(score(from, box(100, 250), "up")).toBeNull();
  });
});

describe("best details", () => {
  it("returns null when there are no candidates", () => {
    expect(best(box(0, 0), [], "right")).toBeNull();
  });

  it("skips candidates the scorer rejected", () => {
    const from = box(0, 0);
    const behind = { el: "behind", box: box(-200, 0) };
    const ahead = { el: "ahead", box: box(120, 0) };
    expect(best(from, [behind, ahead], "right")).toBe("ahead");
  });

  it("keeps the first candidate on an exact cost tie", () => {
    const from = box(0, 0);
    const first = { el: "first", box: box(120, 0) };
    const second = { el: "second", box: box(120, 0) };
    expect(best(from, [first, second], "right")).toBe("first");
  });

  it("prefers a centred candidate over a closer but offset one when moving down", () => {
    const from = box(0, 0);
    const centred = { el: "centred", box: box(0, 120) };
    const offsetCloser = { el: "offset", box: box(80, 80) };
    expect(best(from, [offsetCloser, centred], "down")).toBe("centred");
  });

  it("uses the nearest candidate in every direction", () => {
    const from = box(100, 100);
    const rightNear = { el: "right-near", box: box(250, 100) };
    const rightFar = { el: "right-far", box: box(400, 100) };
    expect(best(from, [rightFar, rightNear], "right")).toBe("right-near");
    expect(best(box(300, 100), [rightNear, rightFar], "left")).toBe(
      "right-near",
    );

    const belowNear = { el: "below-near", box: box(100, 250) };
    const belowFar = { el: "below-far", box: box(100, 400) };
    expect(best(from, [belowFar, belowNear], "down")).toBe("below-near");

    const aboveNear = { el: "above-near", box: box(100, -150) };
    const aboveFar = { el: "above-far", box: box(100, -300) };
    expect(best(from, [aboveFar, aboveNear], "up")).toBe("above-near");
  });
});
