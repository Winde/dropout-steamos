import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateFetch, UpdateResponse } from "../src/main/updater";
import {
  appImageName,
  checksumFor,
  compareVersions,
  currentAppImage,
  parseRelease,
  parseReleaseNotes,
  relaunchArgs,
  Updater,
  writableAppImage,
} from "../src/main/updater";

function jsonResponse(value: unknown): UpdateResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(value),
    text: () => Promise.resolve(""),
    body: null,
  };
}

function textResponse(text: string): UpdateResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(text),
    body: null,
  };
}

function bodyResponse(body: Uint8Array): UpdateResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(""),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    }),
  };
}

function releasePayload(version: string): unknown {
  const base = `https://github.com/Winde/dropout-steamos/releases/download/v${version}`;
  const name = appImageName(version);
  return {
    tag_name: `v${version}`,
    assets: [
      { name, browser_download_url: `${base}/${name}` },
      { name: "SHA256SUMS.txt", browser_download_url: `${base}/SHA256SUMS.txt` },
    ],
  };
}

const temporaries: string[] = [];

function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), "drop-in-update-"));
  temporaries.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaries.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("compareVersions", () => {
  it.each([
    ["0.1.5", "0.1.4", 1],
    ["0.1.4", "0.1.4", 0],
    ["v0.2.0", "0.2.0", 0],
    ["0.10.0", "0.9.9", 1],
    ["oops", "0.1.0", 0],
  ])("ranks %s against %s", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it("puts a pre-release before the release it leads to", () => {
    expect(compareVersions("0.2.0-rc.1", "0.2.0")).toBeLessThan(0);
    expect(compareVersions("0.2.0", "0.2.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0-rc.2", "0.2.0-rc.1")).toBeGreaterThan(0);
  });
});

describe("appImageName", () => {
  it("matches the name electron-builder and the installer use", () => {
    expect(appImageName("0.2.0")).toBe("Drop-In-0.2.0-x86_64.AppImage");
  });
});

describe("parseRelease", () => {
  it("reads the tag without its v and keeps the assets it can trust", () => {
    const release = parseRelease({
      tag_name: "v0.2.0",
      assets: [
        {
          name: "Drop-In-0.2.0-x86_64.AppImage",
          browser_download_url:
            "https://github.com/Winde/dropout-steamos/releases/download/v0.2.0/Drop-In-0.2.0-x86_64.AppImage",
        },
        {
          name: "elsewhere.AppImage",
          browser_download_url: "https://example.com/elsewhere.AppImage",
        },
        { name: "notes.txt" },
      ],
    });

    expect(release.version).toBe("0.2.0");
    expect(release.assets).toEqual([
      {
        name: "Drop-In-0.2.0-x86_64.AppImage",
        url: "https://github.com/Winde/dropout-steamos/releases/download/v0.2.0/Drop-In-0.2.0-x86_64.AppImage",
      },
    ]);
  });

  it("refuses a release without a version", () => {
    expect(() => parseRelease({ tag_name: "nightly" })).toThrow(
      /no usable version/,
    );
    expect(() => parseRelease(null)).toThrow(/unexpected/);
  });
});

describe("parseReleaseNotes", () => {
  function release(
    version: string,
    body: string | null,
    extra: Record<string, unknown> = {},
  ) {
    return {
      tag_name: `v${version}`,
      body,
      prerelease: false,
      draft: false,
      ...extra,
    };
  }

  it("keeps the stable releases between the running and offered versions", () => {
    const notes = parseReleaseNotes(
      [
        release("0.3.0", "Player changes."),
        release("0.2.1", "Caption fix."),
        release("0.2.0", "Big changes."),
        release("0.1.4", "Running version."),
        release("0.1.3", "Older."),
      ],
      "0.1.4",
      "0.3.0",
    );

    expect(notes).toEqual([
      { version: "0.3.0", notes: "Player changes." },
      { version: "0.2.1", notes: "Caption fix." },
      { version: "0.2.0", notes: "Big changes." },
    ]);
  });

  it("leaves pre-releases, drafts and unusable tags out", () => {
    const notes = parseReleaseNotes(
      [
        release("0.3.0-beta.1", "Beta.", { prerelease: true }),
        release("0.2.2", "Draft.", { draft: true }),
        release("nightly", "Nightly."),
        release("0.2.1", null),
        { tag_name: "v0.2.0" },
      ],
      "0.1.4",
      "0.3.0",
    );

    expect(notes).toEqual([
      { version: "0.2.1", notes: "" },
      { version: "0.2.0", notes: "" },
    ]);
  });

  it("reads the notes newest first even when GitHub lists them out of order", () => {
    const notes = parseReleaseNotes(
      [
        release("0.2.0", "Second."),
        release("0.10.0", "Tenth."),
        release("0.3.0", "Third."),
      ],
      "0.1.4",
      "0.10.0",
    );

    expect(notes.map((note) => note.version)).toEqual([
      "0.10.0",
      "0.3.0",
      "0.2.0",
    ]);
  });

  it("refuses a payload that is not a list", () => {
    expect(() =>
      parseReleaseNotes({ tag_name: "v0.2.0" }, "0.1.4", "0.2.0"),
    ).toThrow(/unexpected/);
  });
});

describe("checksumFor", () => {
  const hash = "a".repeat(64);

  it("finds the hash for a file in a sha256sum listing", () => {
    const sums = [
      `${"b".repeat(64)}  other.tar`,
      `${hash}  Drop-In-0.2.0-x86_64.AppImage`,
    ].join("\n");

    expect(checksumFor(sums, "Drop-In-0.2.0-x86_64.AppImage")).toBe(hash);
    expect(checksumFor(sums, "missing.AppImage")).toBeNull();
  });
});

describe("writableAppImage", () => {
  it("resolves the file the AppImage runtime names", () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old");

    expect(writableAppImage({ APPIMAGE: target }, () => true)).toBe(target);
    expect(writableAppImage({ APPIMAGE: target }, () => false)).toBeNull();
    expect(writableAppImage({}, () => true)).toBeNull();
    expect(
      writableAppImage({ APPIMAGE: join(directory, "gone") }, () => true),
    ).toBeNull();
  });

  it("reads the running process environment", () => {
    expect(currentAppImage({ APPIMAGE: "/nonexistent/Drop-In.AppImage" })).toBeNull();
  });
});

describe("relaunchArgs", () => {
  it("drops one-shot launch flags", () => {
    expect(
      relaunchArgs(
        ["--screenshot=C:/shot.png", "--no-sandbox", "positional"],
        {},
      ),
    ).toEqual(["--no-sandbox", "positional"]);
  });

  it("keeps extract-and-run for an AppImage that is not FUSE-mounted", () => {
    expect(relaunchArgs([], { APPDIR: "/tmp/appimage_extracted_1a2b" })).toEqual(
      ["--appimage-extract-and-run"],
    );
    expect(relaunchArgs([], { APPDIR: "/tmp/.mount_DropInAbCd" })).toEqual([]);
    expect(
      relaunchArgs(["--appimage-extract-and-run"], { APPDIR: "/tmp/extracted" }),
    ).toEqual(["--appimage-extract-and-run"]);
  });
});

describe("Updater", () => {
  function updater(
    fetch: UpdateFetch,
    options: { version?: string; appImage?: string | null } = {},
  ) {
    return new Updater({
      currentVersion: () => options.version ?? "0.1.4",
      appImage: () => options.appImage ?? null,
      fetch,
    });
  }

  it("reports a newer stable release", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(releasePayload("0.2.0"))),
    );

    const info = await updater(fetch, {
      appImage: "/home/deck/Applications/Drop-In.AppImage",
    }).check();

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/Winde/dropout-steamos/releases/latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/vnd.github+json",
        }),
      }),
    );
    expect(info).toEqual({
      current: "0.1.4",
      latest: "0.2.0",
      available: true,
      canInstall: true,
    });
  });

  it("does not call an older or equal release an update", async () => {
    for (const version of ["0.1.4", "0.1.3"]) {
      const info = await updater(
        () => Promise.resolve(jsonResponse(releasePayload(version))),
        { appImage: "/home/deck/Applications/Drop-In.AppImage" },
      ).check();
      expect(info.available).toBe(false);
      expect(info.canInstall).toBe(false);
    }
  });

  it("knows when this build cannot replace itself", async () => {
    const info = await updater(() =>
      Promise.resolve(jsonResponse(releasePayload("0.2.0"))),
    ).check();

    expect(info.available).toBe(true);
    expect(info.canInstall).toBe(false);
  });

  const RELEASES_LIST =
    "https://api.github.com/repos/Winde/dropout-steamos/releases?per_page=100";

  it("fetches the notes of every release between the running and pending ones once", async () => {
    const list = [
      { tag_name: "v0.2.0", body: "Player changes." },
      { tag_name: "v0.1.5", body: "Caption fix." },
      { tag_name: "v0.1.4", body: "Running version." },
    ];
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        jsonResponse(url === RELEASES_LIST ? list : releasePayload("0.2.0")),
      ),
    );
    const service = updater(fetch);

    await service.check();
    const expected = [
      { version: "0.2.0", notes: "Player changes." },
      { version: "0.1.5", notes: "Caption fix." },
    ];
    await expect(service.notes()).resolves.toEqual(expected);
    await expect(service.notes()).resolves.toEqual(expected);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      RELEASES_LIST,
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "Winde/dropout-steamos 0.1.4",
        }),
      }),
    );
  });

  it("has no notes before a check or when the running version is current", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(releasePayload("0.1.4"))),
    );
    const service = updater(fetch);

    await expect(service.notes()).resolves.toEqual([]);
    await service.check();
    await expect(service.notes()).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fetches a new changelog when the offered release changes", async () => {
    let latest = "0.2.0";
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        jsonResponse(
          url === RELEASES_LIST
            ? [{ tag_name: `v${latest}`, body: `Notes for ${latest}.` }]
            : releasePayload(latest),
        ),
      ),
    );
    const service = updater(fetch);

    await service.check();
    await expect(service.notes()).resolves.toEqual([
      { version: "0.2.0", notes: "Notes for 0.2.0." },
    ]);

    latest = "0.3.0";
    await service.check();
    await expect(service.notes()).resolves.toEqual([
      { version: "0.3.0", notes: "Notes for 0.3.0." },
    ]);
  });

  it("explains a release list that could not be read, and tries again next time", async () => {
    let fail = true;
    const fetch = vi.fn((url: string) => {
      if (url === RELEASES_LIST) {
        return Promise.resolve(
          fail
            ? ({
                ...jsonResponse(null),
                ok: false,
                status: 500,
              } as UpdateResponse)
            : jsonResponse([{ tag_name: "v0.2.0", body: "Player changes." }]),
        );
      }
      return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
    });
    const service = updater(fetch);

    await service.check();
    await expect(service.notes()).rejects.toThrow(/GitHub answered 500/);

    fail = false;
    await expect(service.notes()).resolves.toEqual([
      { version: "0.2.0", notes: "Player changes." },
    ]);
  });

  it("explains a GitHub that is out of reach", async () => {
    await expect(
      updater(() => Promise.reject(new TypeError("fetch failed"))).check(),
    ).rejects.toThrow(/Could not reach GitHub/);
  });

  it("explains a refused request", async () => {
    const fetch = () =>
      Promise.resolve({
        ...jsonResponse(null),
        ok: false,
        status: 404,
      } as UpdateResponse);

    await expect(updater(fetch).check()).rejects.toThrow(
      /No release has been published/,
    );
  });

  it("installs into place after checking", async () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old build");

    const bytes = Buffer.from("new build");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = appImageName("0.2.0");
    const fetch: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(textResponse(`${hash}  ${name}\n`));
      }
      return Promise.resolve(bodyResponse(bytes));
    };
    const service = updater(fetch, { appImage: target });

    await service.check();
    const installed = await service.install();

    expect(installed).toBe(target);
    expect(readFileSync(target, "utf8")).toBe("new build");
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it("leaves the old build alone when the checksum does not match", async () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old build");

    const name = appImageName("0.2.0");
    const fetch: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${"0".repeat(64)}  ${name}\n`),
        );
      }
      return Promise.resolve(bodyResponse(Buffer.from("corrupted")));
    };
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(/checksum/);

    expect(readFileSync(target, "utf8")).toBe("old build");
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it("refuses a release that is missing its AppImage or checksums", async () => {
    const target = join(temporary(), "Drop-In.AppImage");
    const fetch = () =>
      Promise.resolve(
        jsonResponse({
          tag_name: "v0.2.0",
          assets: [
            {
              name: appImageName("0.2.0"),
              browser_download_url: `https://github.com/Winde/dropout-steamos/releases/download/v0.2.0/${appImageName("0.2.0")}`,
            },
          ],
        }),
      );
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(
      /missing its AppImage or checksums/,
    );
  });

  it("explains a checksum download that failed", async () => {
    const target = join(temporary(), "Drop-In.AppImage");
    const fetch: UpdateFetch = (url) =>
      url.startsWith("https://api.github.com/")
        ? Promise.resolve(jsonResponse(releasePayload("0.2.0")))
        : Promise.resolve({
            ...textResponse(""),
            ok: false,
            status: 500,
          } as UpdateResponse);
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(
      /Could not download the release checksums/,
    );
  });

  it("refuses a checksum list that does not name the AppImage", async () => {
    const target = join(temporary(), "Drop-In.AppImage");
    const fetch: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${"0".repeat(64)}  another-file.AppImage\n`),
        );
      }
      return Promise.resolve(bodyResponse(Buffer.from("new build")));
    };
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(/does not list/);
  });

  it("reports a failed or empty update download and leaves the old build alone", async () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old build");
    const name = appImageName("0.2.0");

    const refused: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${"0".repeat(64)}  ${name}\n`),
        );
      }
      return Promise.resolve({
        ...bodyResponse(new Uint8Array()),
        ok: false,
        status: 500,
      });
    };
    const refusedService = updater(refused, { appImage: target });
    await refusedService.check();
    await expect(refusedService.install()).rejects.toThrow(
      /download failed \(500\)/,
    );

    const empty: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${"0".repeat(64)}  ${name}\n`),
        );
      }
      return Promise.resolve({ ...jsonResponse(null), body: null });
    };
    const emptyService = updater(empty, { appImage: target });
    await emptyService.check();
    await expect(emptyService.install()).rejects.toThrow(
      /download was empty/,
    );

    expect(readFileSync(target, "utf8")).toBe("old build");
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it("cleans up an interrupted download instead of replacing the app", async () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old build");
    const name = appImageName("0.2.0");
    const interrupted = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("partial"));
        controller.error(new Error("connection dropped"));
      },
    });
    const fetch: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${"0".repeat(64)}  ${name}\n`),
        );
      }
      return Promise.resolve({ ...jsonResponse(null), body: interrupted });
    };
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(
      /download was interrupted/,
    );

    expect(readFileSync(target, "utf8")).toBe("old build");
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it("can try the same checked release again after a failed install", async () => {
    const directory = temporary();
    const target = join(directory, "Drop-In.AppImage");
    writeFileSync(target, "old build");
    const bytes = Buffer.from("new build");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = appImageName("0.2.0");
    let healthy = false;
    const fetch: UpdateFetch = (url) => {
      if (url.startsWith("https://api.github.com/")) {
        return Promise.resolve(jsonResponse(releasePayload("0.2.0")));
      }
      if (url.endsWith("SHA256SUMS.txt")) {
        return Promise.resolve(
          textResponse(`${healthy ? hash : "0".repeat(64)}  ${name}\n`),
        );
      }
      return Promise.resolve(bodyResponse(bytes));
    };
    const service = updater(fetch, { appImage: target });

    await service.check();
    await expect(service.install()).rejects.toThrow(/checksum/);

    healthy = true;
    await expect(service.install()).resolves.toBe(target);
    expect(readFileSync(target, "utf8")).toBe("new build");
  });

  it("refuses to install before a check, or without an AppImage", async () => {
    const fetch = () =>
      Promise.resolve(jsonResponse(releasePayload("0.2.0")));

    await expect(updater(fetch).install()).rejects.toThrow(
      /Check for updates/,
    );

    const service = updater(fetch);
    await service.check();
    await expect(service.install()).rejects.toThrow(/cannot update itself/);
  });
});
