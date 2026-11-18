import { describe, expect, it } from "vitest";
import { formatTime } from "../src/tv/time";

describe("formatTime", () => {
  it("formats zero", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("pads seconds below ten", () => {
    expect(formatTime(5)).toBe("0:05");
  });

  it("formats minutes", () => {
    expect(formatTime(65)).toBe("1:05");
  });

  it("drops the hour until the first full hour", () => {
    expect(formatTime(3599)).toBe("59:59");
    expect(formatTime(3600)).toBe("1:00:00");
  });

  it("formats hours and minutes together", () => {
    expect(formatTime(3661)).toBe("1:01:01");
    expect(formatTime(86399)).toBe("23:59:59");
  });

  it("keeps counting hours past a day", () => {
    expect(formatTime(86400)).toBe("24:00:00");
    expect(formatTime(90061)).toBe("25:01:01");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(59.99)).toBe("0:59");
    expect(formatTime(60.5)).toBe("1:00");
  });

  it("treats negative, infinite, and NaN values as zero", () => {
    expect(formatTime(-0.1)).toBe("0:00");
    expect(formatTime(-42)).toBe("0:00");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});
