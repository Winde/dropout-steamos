import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IPC } from "../src/shared/ipc";

/**
 * The wire names are the contract between the two processes. A rename that
 * reaches both sides is a change to the app's own protocol, so it should be
 * deliberate and visible here.
 */
const WIRE_NAMES = {
  quit: "dropin:quit",
  version: "dropin:version",
  updateCheck: "dropin:update-check",
  updateNotes: "dropin:update-notes",
  updateInstall: "dropin:update-install",
  updatePage: "dropin:update-page",
};

/** A channel name typed where the call is made, rather than imported. */
const RAW_CHANNEL =
  /\b(?:ipcRenderer|ipcMain)\s*\.\s*(?:send|invoke|on|handle)\s*\(\s*["'`]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"));
}

describe("IPC channels", () => {
  it("keeps the wire names stable", () => {
    expect(IPC).toEqual(WIRE_NAMES);
  });

  it("has one unique name per channel", () => {
    const names = Object.values(IPC);
    expect(new Set(names).size).toBe(names.length);
  });

  it("takes every channel name from the shared module", () => {
    const offenders = sources("src").filter((file) =>
      RAW_CHANNEL.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
