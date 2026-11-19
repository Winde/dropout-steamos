import type { Mod } from "./types";

const PLAYER_ID = "watch-embed";

/**
 * Site change: keep the browser's native tooltip off the player.
 *
 * The site names the player iframe with title="Video Player". Chromium shows
 * that as a tooltip when the pointer rests over the player, which is noise on a
 * TV. Move the name to aria-label, so assistive technology still has it.
 */
function clearTitle(frame: HTMLIFrameElement): void {
  if (frame.id !== PLAYER_ID) return;

  const title = frame.getAttribute("title");
  if (!title) return;

  if (!frame.hasAttribute("aria-label")) frame.setAttribute("aria-label", title);
  frame.removeAttribute("title");
}

export const watchFrameTitle: Mod = {
  id: "watch-frame-title",
  pages: ["watch"],
  setup() {
    document
      .querySelectorAll<HTMLIFrameElement>(`iframe#${PLAYER_ID}`)
      .forEach(clearTitle);
  },
};
