import type { PageKind } from "../page";
import type { Mod } from "./types";

const CHROMELESS = "1";
const PLAYER_ID = "watch-embed";

function patch(frame: HTMLIFrameElement): void {
  if (frame.id !== PLAYER_ID) return;

  const raw = frame.getAttribute("src");
  if (!raw || !raw.includes("embed.vhx.tv")) return;

  const url = new URL(raw);
  if (url.searchParams.get("chromeless") === CHROMELESS) return;

  url.searchParams.set("chromeless", CHROMELESS);
  frame.src = url.toString();
}

/**
 * Site change: use the Vimeo OTT player's documented chromeless mode.
 * It removes the player's own control bar, which would otherwise sit under
 * our OSD. The iframe is patched before it starts loading where possible.
 */
function applyChromeless(page: PageKind): void {
  if (page !== "watch") return;

  document
    .querySelectorAll<HTMLIFrameElement>(`iframe#${PLAYER_ID}`)
    .forEach(patch);

  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLIFrameElement) {
          patch(node);
        } else if (node instanceof Element) {
          node
            .querySelectorAll<HTMLIFrameElement>(`iframe#${PLAYER_ID}`)
            .forEach(patch);
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

export const chromeless: Mod = {
  id: "chromeless",
  pages: ["watch"],
  early: applyChromeless,
};
