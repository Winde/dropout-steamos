# Site changes

Every change this app makes to the Dropout storefront or its player lives in
its own mod in `src/tv/mods/`. If Dropout's DOM changes, check this list first:
each entry names the file to edit and the selector it depends on.

The single registry is `src/tv/mods/index.ts`; the runtime injects each CSS
file as its own `<style data-dropin-mod="…">` tag, so it can be inspected or
removed from devtools without touching the others. Registry order is
action/focus priority.

## CSS overrides

| Change | File | Selector | Why | Remove when |
| --- | --- | --- | --- | --- |
| Focus ring | `src/tv/mods/focus-ring.css` | `.dropin-focus` | The only focus affordance on a TV; outline does not change layout. Card links suppress the inner outline because the fixed TV ring already wraps the whole card. | The site ships a visible TV focus style. |
| Hide pointer while idle | `src/tv/mods/cursor.css` | `html.dropin-hide-cursor` | No mouse is needed; the cursor hides after 2.5 s. | Never (TV shell). |
| Hide catalog hero | `src/tv/mods/catalog-hero.css` | `html.dropin-catalog .carousel` | The autoplaying hero takes a full screen and duplicates row CTAs. | The site gets a static, TV-sized hero. |
| Hide scrollbars | `src/tv/mods/scrollbar.css` | `html`, `::-webkit-scrollbar` | Scrollbars are pointer furniture; scrolling still works. | Never (TV shell). |
| Edge-to-edge player | `src/tv/mods/watch-player.css` | `#watch-player`, `.embed`, `iframe` | The OSD overlays the player, so the player must own the viewport. The site's `max-height` rules are desktop limits and must be overridden. | The site provides a full-viewport watch layout. |
| Header version line | `src/tv/mods/updates.css` | `.dropin-update` | Drop-In has no app menu. A two-line build stamp in the header's secondary actions shows the running version and opens the update dialog without overlaying content. | The site offers an app/settings menu. |

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

The running version and the update entry are a `<button class="dropin-update">`
appended to the header's secondary-actions group (`.site-header` →
`.user-actions`). It is a two-line build stamp: **Drop-In vX.Y.Z** over
**Check for updates**. Because it is a normal button in the page, D-pad
navigation reaches it like Sign In; moving up from the content reaches the
header. When a check finds a release, the second line becomes **Update to
vX.Y.Z** in the site accent colour.

The dialog is a shadow root on `<div data-dropin="update-dialog">`, like the
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

## Catalog

### Carousel edges

**File:** `src/tv/mods/carousel-edge.ts`

Slick marks every slide outside the current window `aria-hidden`, so the focus
collector sees no card past the last visible one and a left/right press at a
row's edge did nothing. The mod claims that edge press, clicks the site's own
`.browse-right-arrow` or `.browse-left-arrow`, and moves focus to the card one
slide over before the carousel starts moving. The ring therefore rides the
incoming card instead of being left behind. Directions and A are ignored until
the 500 ms slide ends, so repeated presses cannot land on a half-visible card.
Left at the first slide pages back to the end of the row; `slick-disabled`
arrows are still left alone. When an infinite row resets from its clones, focus
moves to the visible card with the same destination instead of staying on the
off-screen clone.

- To undo: remove `carouselEdge` from `src/tv/mods/index.ts`.

### Row titles

**Files:** `src/tv/mods/row-title-focus.ts`,
`src/tv/mods/row-title-focus.css`

Each carousel heading is an `<h1><a>` linking to the collection page, and the
**View all** link beside it goes to the same place. On a TV the heading labels
the row, so both links are removed from the D-pad and tab order. View all is
hidden completely: it sat at the row's right edge, where a press belongs to
paging.

- To undo: remove `rowTitleFocus` from `src/tv/mods/index.ts`.

### Card hover info

**Files:** `src/tv/mods/card-tooltips.ts`,
`src/tv/mods/card-tooltips.css`

Browse cards and collection episodes carry a `.tooltip` (browse cards also
`[data-testid="browse-tooltip"]`) that the site positions on hover. A TV has no
pointer, and the popup can cover a row, so the stylesheet hides every tooltip on
catalog pages.

- To undo: remove `cardTooltips` from `src/tv/mods/index.ts`.

## Login

### Passwordless sign-in link

**File:** `src/tv/mods/login-magic-link.ts`

The password step renders **Email me a sign in link** as `#signin-magic-submit`
(also `.signin-flow__password-form-magic-btn`), an `<a>` with no `href`. That
leaves it out of both the browser tab order and the TV focusable selector, so
neither Tab nor the D-pad could reach it. The mod adds `tabindex="0"` and
`role="button"` on setup; A/Enter then follow the normal select path and click
the element, which submits the site's magic form.

- To undo: remove `loginMagicLink` from `src/tv/mods/index.ts`.

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
- `#signin-email-input`, `#signin-password-input`, `#signin-magic-submit` — login
  (see `src/tv/mods/login-focus.ts`, `src/tv/mods/login-magic-link.ts`,
  `src/tv/mods/login-back.ts` and `src/tv/focus.ts`).
- `.tooltip` — card hover info hidden on catalog pages (see
  `src/tv/mods/card-tooltips.ts`).
- `.browse-item-card` — one D-pad stop per card (see `src/tv/mods/card-focus.ts`).
- `.browse-row`, `.browse-left-arrow`, `.browse-right-arrow` — a row's cards and
  the arrows its edge press clicks (see `src/tv/mods/carousel-edge.ts`).
- `.horizontal-row-header`, `.view-more-link` — row heading and its **View all**
  link; both are removed from focus, and View all is hidden (see
  `src/tv/mods/row-title-focus.ts` and `row-title-focus.css`).
- `.js-switch-season`, `[data-sort-by]`, `#language-switcher` — native selects opened by the TV picker (see `src/tv/mods/select-picker.ts`).
- `.site-header .user-actions` — the version/update entry sits in the header's secondary actions (see `src/tv/mods/updates.ts`).
