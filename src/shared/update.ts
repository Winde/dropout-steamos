/** Types shared by the main process's updater and the TV layer's update mod. */

/** What GitHub's latest stable release says about this build. */
export interface UpdateInfo {
  /** The version running now, without a leading `v`. */
  current: string;
  /** The newest stable release, without a leading `v`. */
  latest: string;
  /** True when `latest` is newer than `current`. */
  available: boolean;
  /**
   * True when this build can replace itself: it runs from a writable AppImage.
   * Otherwise there is only a download to point at.
   */
  canInstall: boolean;
}

/** One release's notes, for the changelog shown before an update. */
export interface ReleaseNote {
  /** The version the notes belong to, without a leading `v`. */
  version: string;
  /** The release body as GitHub stores it (Markdown), empty when there is none. */
  notes: string;
}
