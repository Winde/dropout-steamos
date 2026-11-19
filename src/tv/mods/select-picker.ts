import { focusElement } from "../focus";
import {
  closePicker,
  confirmPicker,
  isPickerOpen,
  movePicker,
  openPicker,
} from "../picker";
import type { Mod } from "./types";

/**
 * A native <select> is a button on a TV: A opens the picker, up/down
 * moves the highlight, A confirms and B closes. Left/right are left to normal
 * spatial navigation, so the Season and Sort controls behave like any other
 * neighbours.
 */
export const selectPicker: Mod = {
  id: "select-picker",
  action(action, ctx) {
    if (isPickerOpen()) {
      switch (action) {
        case "up":
          movePicker(-1);
          return true;
        case "down":
          movePicker(1);
          return true;
        case "select":
          confirmPicker();
          return true;
        case "back":
          closePicker();
          return true;
        default:
          // The modal owns input while it is open.
          return true;
      }
    }

    if (action !== "select") return false;

    const current = ctx.current();
    if (!(current instanceof HTMLSelectElement)) return false;

    focusElement(current);
    openPicker(current);
    return true;
  },
};
