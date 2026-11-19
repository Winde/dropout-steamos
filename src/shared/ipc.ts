/**
 * The renderer-to-main channels, in one place.
 *
 * Both processes import these, so renaming a channel is one edit that both
 * sides see instead of two string literals that can drift apart and leave a
 * handler that silently stops answering. tests/ipc.test.ts pins the wire names
 * and fails on a channel string typed at a call site.
 */
export const IPC = {
  quit: "dropin:quit",
  version: "dropin:version",
  updateCheck: "dropin:update-check",
  updateNotes: "dropin:update-notes",
  updateInstall: "dropin:update-install",
  updatePage: "dropin:update-page",
} as const;
