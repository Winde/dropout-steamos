import type { Mod } from "./types";

function rejectButton(): HTMLButtonElement | null {
  const direct = document.querySelector<HTMLButtonElement>(
    "#ketch-banner-button-tertiary",
  );
  if (direct) return direct;

  return (
    [...document.querySelectorAll<HTMLButtonElement>("#ketch-banner button")].find(
      (button) => /reject/i.test(button.textContent ?? ""),
    ) ?? null
  );
}

/**
 * Site change: dismiss the Ketch cookie banner by choosing Reject All.
 * Ketch only stops rendering the banner after it has recorded an interaction;
 * seeding the consent cookie alone does not work. The observer clicks before
 * the banner paints, so the player is never covered.
 */
function rejectCookiesOnSight(): void {
  const tryReject = (): boolean => {
    const button = rejectButton();
    if (!button) return false;
    button.click();
    return true;
  };

  if (tryReject()) return;

  const observer = new MutationObserver(() => {
    if (tryReject()) {
      clearTimeout(giveUp);
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  // The banner normally appears within a second or two. Stop watching the
  // whole document if this page has no banner at all.
  const giveUp = setTimeout(() => observer.disconnect(), 15_000);
}

/** Reject the cookie banner as soon as it exists. */
export const cookieReject: Mod = {
  id: "cookie-reject",
  early: rejectCookiesOnSight,
};
