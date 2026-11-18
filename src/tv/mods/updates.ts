import { createUpdateUi, type UpdateUi } from "../update";
import css from "./updates.css";
import type { Mod } from "./types";

let ui: UpdateUi | null = null;

/**
 * The shell's version line and update dialog, injected as one mod.
 *
 * The version is a quiet build stamp in the storefront header, as a normal
 * button the D-pad reaches like Sign In. Y (menu) opens the same dialog from
 * anywhere. While the dialog is up it consumes input, including B, so the page
 * underneath cannot act on a press meant for the dialog.
 */
export const updates: Mod = {
  id: "updates",
  // The watch page is owned by the player; the header is not part of its
  // edge-to-edge layout.
  pages: ["catalog", "login", "other"],
  css,
  setup(ctx) {
    ui = createUpdateUi({
      current: ctx.current,
      focus: ctx.focus,
      focusPage: ctx.focusPage,
    });
    ui.mount();
  },
  action(action) {
    return ui ? ui.action(action) : false;
  },
};
