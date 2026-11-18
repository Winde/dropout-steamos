import { attachPlayer, type PlayerControl } from "../player";
import type { Mod } from "./types";

let control: PlayerControl | null = null;

export const player: Mod = {
  id: "player",
  pages: ["watch"],
  setup() {
    control = attachPlayer();
  },
  focus() {
    // The OSD owns focus on a watch page; the storefront behind it is inert.
    return true;
  },
  action(action) {
    control?.action(action);
    return true;
  },
};
