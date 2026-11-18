# Site changes

Every change this app makes to the Dropout storefront or its player lives in
its own mod in `src/tv/mods/`. If Dropout's DOM changes, check this list first:
each entry names the file to edit and the selector it depends on.

The single registry is `src/tv/mods/index.ts`; the runtime injects each CSS
file as its own `<style data-couch-mod="…">` tag, so it can be inspected or
removed from devtools without touching the others. Registry order is
action/focus priority.

## CSS overrides

| Change | File | Selector | Why | Remove when |
| --- | --- | --- | --- | --- |
| Focus ring | `src/tv/mods/focus-ring.css` | `.couch-focus` | The only focus affordance on a TV; outline does not change layout. Card links suppress the inner outline because the fixed TV ring already wraps the whole card. | The site ships a visible TV focus style. |
| Hide pointer while idle | `src/tv/mods/cursor.css` | `html.couch-hide-cursor` | No mouse is needed; the cursor hides after 2.5 s. | Never (TV shell). |
| Hide catalog hero | `src/tv/mods/catalog-hero.css` | `html.couch-catalog .carousel` | The autoplaying hero takes a full screen and duplicates row CTAs. | The site gets a static, TV-sized hero. |
| Hide scrollbars | `src/tv/mods/scrollbar.css` | `html`, `::-webkit-scrollbar` | Scrollbars are pointer furniture; scrolling still works. | Never (TV shell). |
| Edge-to-edge player | `src/tv/mods/watch-player.css` | `#watch-player`, `.embed`, `iframe` | The OSD overlays the player, so the player must own the viewport. The site's `max-height` rules are desktop limits and must be overridden. | The site provides a full-viewport watch layout. |
| Header version line | `src/tv/mods/updates.css` | `.couch-update` | Drop-In has no app menu. A two-line build stamp in the header's secondary actions shows the running version and opens the update dialog without overlaying content. | The site offers an app/settings menu. |

## Player and consent

### Chromeless player

**File:** `src/tv/mods/chromeless.ts`

Adds the documented Vimeo OTT embed option `chromeless=1` to `iframe#watch-embed`.
This removes the player's own control bar, so the controller-navigable OSD is
the only bar. The iframe is patched as it is parsed (and on later insertions),
before it starts loading.

- Player docs: <https://dev.vhx.tv/player/> → Query Parameters → `chromeless`.
- To undo: remove the `chromeless` entry from `src/tv/mods/index.ts` and
  restore the player's native controls by reverting the OSD overlay.

### Cookie banner

**Files:** `src/tv/mods/cookie-reject.ts` (reject on sight) and
`src/tv/mods/cookie-focus.ts` (focus trap and B fallback).

Ketch renders the consent banner unless it has recorded an interaction, so
seeding a consent cookie alone does not hide it (verified). The app clicks
**Reject All** as soon as the button exists, which stores the denied state and
removes the banner and its full-screen wrappers. This is the privacy-preserving
choice.

- Button: `#ketch-banner-button-tertiary`, falling back to a button whose text
  matches `/reject/i` inside `#ketch-banner`.
- If the banner ever returns: inspect the button ids under `#ketch-banner` and
  update `rejectButton()`.
- To undo the automatic rejection, remove `cookieReject`; to undo the modal
  focus/B handling, remove `cookieFocus` from `src/tv/mods/index.ts`.

### Version line and updates

**Files:** `src/tv/mods/updates.ts` (the mod), `src/tv/mods/updates.css`
(header styling), `src/tv/update.ts` (header entry, shadow-DOM dialog), and
`src/main/updater.ts` (GitHub Releases, checksum, AppImage swap).

The running version and the update entry are a `<button class="couch-update">`
appended to the header's secondary-actions group (`.site-header` →
`.user-actions`). It is a two-line build stamp: **Drop-In vX.Y.Z** over
**Check for updates**. Because it is a normal button in the page, D-pad
navigation reaches it like Sign In; moving up from the content reaches the
header. When a check finds a release, the second line becomes **Update to
vX.Y.Z** in the site accent colour.

The dialog is a shadow root on `<div data-couch="update-dialog">`, like the
picker and OSD. While it is open, the mod consumes every action: left/right
moves between actions, up/down scrolls the release notes when there are any,
A activates, and B closes. Installing or restarting swallows input entirely.

Outside the player, **Y** (menu) opens the same dialog from any page, which is
the fast path when the D-pad is deep in a long catalog. On watch pages the mod
is inactive and Y stays with the player.

The updater only swaps an AppImage it can write (`APPIMAGE` plus a writable
directory); dev builds and other packages show a releases-page action instead.
Release assets must keep the electron-builder name
`Drop-In-<version>-x86_64.AppImage` and ship `SHA256SUMS.txt`.

## Shell behaviours (not DOM patches)

| Change | File | What it does |
| --- | --- | --- |
| English UI | `src/main/locale.ts`, `src/main/index.ts` | Forces Chromium's `--lang=en-US`, sends `Accept-Language: en-US,en;q=0.9`, and pins both `locale=en` and `locale_det=en`. A stale `locale=pt` cookie from the on-site switcher otherwise keeps the storefront Portuguese. |
| Window fullscreen | `src/main/index.ts` | The player's fullscreen button cannot be allowed: making the cross-origin iframe the fullscreen element hides the OSD. The request is denied and the window is fullscreened instead. |
| Select picker | `src/tv/mods/select-picker.ts`, `src/tv/picker.ts`, `src/tv/input.ts` | `<select>` is a button on TV: A opens a shadow-DOM picker, up/down moves the highlight, A confirms and B closes. Left/right are normal spatial navigation, so the Season and Sort controls reach each other. On confirm the picker sets `selectedIndex` and dispatches `change`, so the site's season/sort/language handlers still work. |
| Player OSD | `src/tv/mods/player.ts`, `src/tv/osd.ts`, `src/tv/player.ts` | Shadow-DOM overlay with play, subtitles, mute, back. Auto-hides while playing, stays on pause. |

## Selection notes

These selectors are observed on the live site and are the fragile part:

- `#watch-player`, `#watch-embed` — watch page and player iframe.
- `iframe#watch-embed` — the player patch targets this id only.
- `#watch-info` — hidden by the edge-to-edge layout; not removed from the DOM.
- `#ketch-banner`, `#ketch-banner-button-tertiary` — consent banner.
- `.carousel` — catalog hero.
- `#signin-email-input`, `#signin-password-input` — login (see `src/tv/mods/login-focus.ts`, `src/tv/mods/login-back.ts` and `src/tv/focus.ts`).
- `.browse-item-card` — one D-pad stop per card (see `src/tv/mods/card-focus.ts`).
- `.js-switch-season`, `[data-sort-by]`, `#language-switcher` — native selects opened by the TV picker (see `src/tv/mods/select-picker.ts`).
- `.site-header .user-actions` — the version/update entry sits in the header's secondary actions (see `src/tv/mods/updates.ts`).
