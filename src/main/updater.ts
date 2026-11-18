import { createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  createReadStream,
  createWriteStream,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReleaseNote, UpdateInfo } from "../shared/update";

/**
 * Updates come from GitHub Releases, the only channel the app has. The AppImage
 * is a single self-contained file, so installing one is a download next to the
 * running file, a checksum, and an atomic rename over it. The same asset names
 * as packaging/install.sh: Drop-In-<version>-x86_64.AppImage + SHA256SUMS.txt.
 */
export const RELEASES_REPO = "Winde/dropout-steamos";
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=100`;
const DOWNLOAD_PREFIX = `${RELEASES_PAGE}/download/`;
const CHECKSUMS_NAME = "SHA256SUMS.txt";
/** GitHub's API rejects requests without a user agent. */
const API_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": RELEASES_REPO,
};
const CHECK_TIMEOUT_MS = 20_000;
/** Slow Deck Wi-Fi still finishes the AppImage well inside this. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/** The slice of fetch this module uses, so tests can answer without a network. */
export interface UpdateResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  body: unknown;
}

/** A body from any fetch implementation: enough to read it chunk by chunk. */
interface UpdateBody {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
  };
}

/** Turns any fetch body into a Node stream pipeline can consume. */
function bodyStream(body: unknown): Readable {
  const reader = (body as UpdateBody).getReader();
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        this.push(done ? null : Buffer.from(value ?? new Uint8Array()));
      } catch (error) {
        this.destroy(
          error instanceof Error ? error : new Error("download failed"),
        );
      }
    },
  });
}

export type UpdateFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<UpdateResponse>;

interface ParsedVersion {
  numbers: number[];
  /** Dot-separated pre-release identifiers; empty for a stable release. */
  pre: string[];
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(
    value.trim().replace(/^v/, ""),
  );
  if (!match) return null;
  return {
    numbers: match[1].split(".").map(Number),
    pre: match[2] ? match[2].split(".") : [],
  };
}

/**
 * Positive when `a` is newer than `b`, 0 when they are the same version.
 * Enough of semver for our own tags: numeric parts, then a pre-release sorts
 * before the release it leads to.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  const parts = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < parts; i++) {
    const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (left.pre.length === 0 && right.pre.length > 0) return 1;
  if (left.pre.length > 0 && right.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn)) return ln - rn;
    return l < r ? -1 : 1;
  }
  return 0;
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface Release {
  /** Tag without its `v`. */
  version: string;
  assets: ReleaseAsset[];
}

/** An AppImage name in the form electron-builder writes it. */
export function appImageName(version: string): string {
  return `Drop-In-${version}-x86_64.AppImage`;
}

/**
 * Read the two fields of a release this app relies on, and drop any asset that
 * is not served from our own download path: the checksum only means something
 * if the file beside it came from the same place.
 */
export function parseRelease(value: unknown): Release {
  if (!value || typeof value !== "object")
    throw new Error("GitHub sent unexpected release data");
  const json = value as { tag_name?: unknown; assets?: unknown };
  const version =
    typeof json.tag_name === "string"
      ? json.tag_name.trim().replace(/^v/, "")
      : "";
  if (!parseVersion(version))
    throw new Error("The latest release has no usable version");

  const assets: ReleaseAsset[] = [];
  if (Array.isArray(json.assets)) {
    for (const asset of json.assets as unknown[]) {
      if (!asset || typeof asset !== "object") continue;
      const { name, browser_download_url: url } = asset as {
        name?: unknown;
        browser_download_url?: unknown;
      };
      if (typeof name !== "string" || typeof url !== "string") continue;
      if (!url.startsWith(DOWNLOAD_PREFIX)) continue;
      assets.push({ name, url });
    }
  }
  return { version, assets };
}

/**
 * The notes of every stable release newer than `current`, newest first.
 *
 * The list endpoint, unlike `releases/latest`, includes pre-releases, so the
 * filter is what keeps a beta out of the changelog for a stable update. A tag
 * that is not a version (or a body GitHub did not send) is skipped rather than
 * failing the list: the update itself does not depend on either.
 *
 * The list is capped at 100 releases. A checkout older than that page's tail
 * gets the notes it can see; the dialog never claims to have the whole range.
 */
export function parseReleaseNotes(
  value: unknown,
  current: string,
  latest: string,
): ReleaseNote[] {
  if (!Array.isArray(value))
    throw new Error("GitHub sent unexpected release data");

  const notes: ReleaseNote[] = [];
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const release = entry as {
      tag_name?: unknown;
      body?: unknown;
      prerelease?: unknown;
      draft?: unknown;
    };
    if (release.prerelease === true || release.draft === true) continue;
    const version =
      typeof release.tag_name === "string"
        ? release.tag_name.trim().replace(/^v/, "")
        : "";
    if (!parseVersion(version)) continue;
    if (
      compareVersions(version, current) <= 0 ||
      compareVersions(version, latest) > 0
    )
      continue;
    notes.push({
      version,
      notes: typeof release.body === "string" ? release.body.trim() : "",
    });
  }

  // GitHub lists releases by creation date; tags can be published out of order.
  return notes.sort((a, b) => compareVersions(b.version, a.version));
}

/** The expected hash for `name` in a `sha256sum *` file, or null. */
export function checksumFor(sums: string, name: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match && match[2] === name) return match[1].toLowerCase();
  }
  return null;
}

/**
 * The AppImage this process runs from, if it can be replaced: the env variable
 * comes from the AppImage runtime, and the directory must be writable because
 * the new file is renamed over the old one. Dev builds and other packages
 * return null.
 */
export function writableAppImage(
  env: NodeJS.ProcessEnv,
  writable: (directory: string) => boolean,
): string | null {
  const raw = env["APPIMAGE"];
  if (!raw) return null;
  try {
    const target = realpathSync(raw);
    return writable(dirname(target)) ? target : null;
  } catch {
    return null;
  }
}

function directoryWritable(directory: string): boolean {
  try {
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Arguments for the relaunched process. One-shot flags are dropped: an update
 * should land on the normal start screen, not screenshot and quit, and not
 * reopen whatever an old launch was pointed at.
 *
 * An AppImage that was extracted to run (because FUSE is missing) has no
 * `.mount_` directory; relaunching it plainly would try FUSE again and fail on
 * that machine, so it keeps the mode it started in.
 */
export function relaunchArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const args = argv.filter(
    (arg) => !arg.startsWith("--open=") && !arg.startsWith("--screenshot="),
  );
  const appDir = env["APPDIR"];
  if (
    appDir &&
    !appDir.includes(".mount_") &&
    !args.includes("--appimage-extract-and-run")
  ) {
    args.push("--appimage-extract-and-run");
  }
  return args;
}

export interface UpdaterOptions {
  currentVersion: () => string;
  appImage: () => string | null;
  fetch: UpdateFetch;
}

export class Updater {
  /** The release a check found, kept so install does not check twice. */
  private pending: Release | null = null;
  /** Notes for `pending`, fetched once when the dialog first asks for them. */
  private notesRequest: Promise<ReleaseNote[]> | null = null;

  constructor(private readonly options: UpdaterOptions) {}

  async check(): Promise<UpdateInfo> {
    const current = this.options.currentVersion();
    let response: UpdateResponse;
    try {
      response = await this.options.fetch(LATEST_RELEASE_API, {
        headers: this.headers(current),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch {
      throw new Error(
        "Could not reach GitHub. Check the connection and try again.",
      );
    }
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "No release has been published yet."
          : `GitHub answered ${response.status}. Try again later.`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("GitHub sent unexpected release data");
    }
    const release = parseRelease(json);
    const available = compareVersions(release.version, current) > 0;
    // Notes belong to the release that was pending; a different one (or none)
    // invalidates them, so the next dialog fetches a matching changelog.
    if (release.version !== this.pending?.version) this.notesRequest = null;
    this.pending = available ? release : null;
    return {
      current,
      latest: release.version,
      available,
      canInstall: available && this.options.appImage() !== null,
    };
  }

  /**
   * The notes of every release between the running version and the pending
   * one, newest first. One request, cached for the life of that release:
   * closing the dialog and opening it again must not spend quota again.
   */
  async notes(): Promise<ReleaseNote[]> {
    const release = this.pending;
    if (!release) return [];
    if (!this.notesRequest) {
      const request = this.fetchNotes(release.version).catch(
        (error: unknown) => {
          // A failed load is not an answer: reopening the dialog tries again.
          if (this.notesRequest === request) this.notesRequest = null;
          throw error;
        },
      );
      this.notesRequest = request;
    }
    return this.notesRequest;
  }

  /**
   * Download the checked release, verify it against the release's checksums and
   * put it where the old AppImage was. Returns the path to relaunch; the caller
   * owns the restart so a failed install never quits the app.
   */
  async install(): Promise<string> {
    const release = this.pending;
    if (!release) throw new Error("Check for updates before installing one");
    const target = this.options.appImage();
    if (!target) throw new Error("This copy of Drop-In cannot update itself");

    const name = appImageName(release.version);
    const asset = release.assets.find((entry) => entry.name === name);
    const checksums = release.assets.find(
      (entry) => entry.name === CHECKSUMS_NAME,
    );
    if (!asset || !checksums)
      throw new Error("The latest release is missing its AppImage or checksums");

    let sums: string;
    try {
      const response = await this.options.fetch(checksums.url, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sums = await response.text();
    } catch {
      throw new Error("Could not download the release checksums.");
    }
    const expected = checksumFor(sums, name);
    if (!expected) throw new Error(`The release does not list ${name}`);

    // Beside the target, so the rename is on one filesystem and atomic: a
    // half-written download never replaces a working app.
    const part = `${target}.part`;
    try {
      await this.download(asset.url, part);
      const actual = await sha256(part);
      if (actual !== expected)
        throw new Error("The downloaded update failed its checksum.");
      chmodSync(part, 0o755);
      renameSync(part, target);
    } catch (error) {
      rmSync(part, { force: true });
      throw error;
    }
    this.pending = null;
    this.notesRequest = null;
    return target;
  }

  private headers(current: string): Record<string, string> {
    return { ...API_HEADERS, "user-agent": `${API_HEADERS["user-agent"]} ${current}` };
  }

  /**
   * The releases page is the only endpoint that returns notes for more than
   * one release at a time; GraphQL could ask for fewer fields but needs a
   * token, and the Atom feed keeps no history beyond its latest entries.
   */
  private async fetchNotes(latest: string): Promise<ReleaseNote[]> {
    const current = this.options.currentVersion();
    let response: UpdateResponse;
    try {
      response = await this.options.fetch(RELEASES_API, {
        headers: this.headers(current),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch {
      throw new Error(
        "Could not reach GitHub. Check the connection and try again.",
      );
    }
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "No release has been published yet."
          : `GitHub answered ${response.status}. Try again later.`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("GitHub sent unexpected release data");
    }
    return parseReleaseNotes(json, current, latest);
  }

  private async download(url: string, destination: string): Promise<void> {
    let response: UpdateResponse;
    try {
      response = await this.options.fetch(url, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new Error(
        "Could not download the update. Check the connection and try again.",
      );
    }
    if (!response.ok)
      throw new Error(`The update download failed (${response.status}).`);
    if (!response.body) throw new Error("The update download was empty.");

    // Read the body ourselves rather than handing it to a Node stream helper:
    // net.fetch's stream comes from Chromium's implementation, and this works
    // with any fetch that speaks the standard reader interface.
    try {
      await pipeline(
        bodyStream(response.body),
        createWriteStream(destination, { mode: 0o755 }),
      );
    } catch {
      throw new Error("The update download was interrupted.");
    }
  }
}

function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** The AppImage this process runs from, when it can replace itself. */
export function currentAppImage(env: NodeJS.ProcessEnv): string | null {
  return writableAppImage(env, directoryWritable);
}
