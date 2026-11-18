#!/usr/bin/env bash
# Install Drop-In on SteamOS / Linux, add it to Steam and apply library art.
set -euo pipefail

REPO="Winde/dropout-steamos"
APP_NAME="Drop-In"
INSTALL_DIR="${HOME}/Applications"
APPIMAGE="${INSTALL_DIR}/Drop-In.AppImage"
ICON_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
ICON="${ICON_DIR}/drop-in.png"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP="${DESKTOP_DIR}/drop-in.desktop"
STATE_DIR="${HOME}/.local/state/drop-in"
ART_MANIFEST="${STATE_DIR}/art.sha256"

VERSION=""
ADD_TO_STEAM=1
UNINSTALL=0
FORCE_ART=0

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
say() { printf '==> %s\n' "$*"; }

# The hash this installer recorded for a file it wrote. No entry means the file
# was not ours to begin with (or the player has replaced ours since).
art_owner_hash() {
  [ -f "$ART_MANIFEST" ] || return 0
  # Hash and path are separated by two spaces; the path may contain spaces.
  awk -v path="$1" 'substr($0, length($1) + 3) == path { print $1; exit }' \
    "$ART_MANIFEST" 2>/dev/null
}

# Copy packaged art into place unless the player has replaced that file. Files
# we wrote earlier are refreshed, so artwork still improves between releases.
install_art() {
  src="$1"
  dst="$2"
  [ -f "$src" ] || return 0
  # No manifest entry is not an error: it just means "leave this one alone".
  owned="$(art_owner_hash "$dst")"
  if [ "$FORCE_ART" -eq 0 ]; then
    if [ ! -f "$dst" ] && [ -n "$owned" ]; then
      # We put this here before and it is gone now: the player removed it.
      # Keep the record so later runs keep leaving it removed.
      printf '%s  %s\n' "$owned" "$dst" >> "$ART_MANIFEST.new"
      return 1
    fi
    if [ -f "$dst" ]; then
      current="$(sha256sum "$dst" | cut -d' ' -f1)"
      if [ -z "$owned" ] || [ "$current" != "$owned" ]; then
        return 1
      fi
    fi
  fi
  mkdir -p "$(dirname "$dst")"
  cp -f "$src" "$dst"
  printf '%s  %s\n' "$(sha256sum "$dst" | cut -d' ' -f1)" "$dst" >> "$ART_MANIFEST.new"
  return 0
}

# Steam owns each shortcut's controller configuration, so this cannot be set
# here. Point at the layouts that present the pad the app reads.
controller_hint() {
  say "One-time in Steam (kept across updates): open Drop-In -> Properties ->"
  say "  Controller and choose Gamepad (or Gamepad with Joystick Trackpad),"
  say "  so the app receives the controller's buttons."
}

usage() {
  cat <<'EOF'
Usage: install.sh [options]

  --version vX.Y.Z   Install a specific release (default: latest)
  --no-steam         Install the app but do not add a Steam shortcut
  --force-art        Replace library artwork changed in Steam with the packaged set
  --uninstall        Remove the AppImage, desktop entry and icon
  -h, --help         Show this help

Run this in Desktop Mode with Steam running. It installs to
~/Applications/Drop-In.AppImage and keeps the site session in Electron's user
data directory.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || die "--version needs a value"
      VERSION="$2"
      shift 2
      ;;
    --version=*)
      VERSION="${1#*=}"
      shift
      ;;
    --no-steam)
      ADD_TO_STEAM=0
      shift
      ;;
    --force-art)
      FORCE_ART=1
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[ "$(id -u)" -eq 0 ] && die "do not run this as root"

if [ "$UNINSTALL" -eq 1 ]; then
  rm -f "$APPIMAGE" "$ICON" "$DESKTOP" "$ART_MANIFEST" "$ART_MANIFEST.new"
  rmdir "$STATE_DIR" 2>/dev/null || true
  say "Removed the AppImage, desktop entry and icon"
  say "Remove the Drop-In shortcut from Steam in Desktop Mode if it is still listed."
  exit 0
fi

for cmd in curl sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || die "missing required command: $cmd"
done

if [ -z "$VERSION" ]; then
  say "Resolving the latest release"
  VERSION="$(curl -fsSIL -o /dev/null -w '%{url_effective}' \
    "https://github.com/${REPO}/releases/latest" | sed 's#.*/tag/##')" \
    || die "could not reach GitHub"
fi
VERSION="${VERSION#v}"
[ -n "$VERSION" ] || die "could not determine the release version"
TAG="v${VERSION}"
APPIMAGE_NAME="Drop-In-${VERSION}-x86_64.AppImage"
BASE="https://github.com/${REPO}/releases/download/${TAG}"

say "Installing Drop-In ${VERSION}"
mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

PART="${APPIMAGE}.part"
cleanup() { rm -f "$PART"; }
trap cleanup EXIT

say "Downloading ${APPIMAGE_NAME}"
curl -fL --retry 3 --progress-bar -o "$PART" "${BASE}/${APPIMAGE_NAME}" \
  || die "download failed"

say "Verifying the checksum"
SUMS="$(mktemp)"
curl -fsSL --retry 3 -o "$SUMS" "${BASE}/SHA256SUMS.txt" \
  || die "could not download SHA256SUMS.txt"
expected="$(grep -F "  ${APPIMAGE_NAME}" "$SUMS" | awk '{print $1}' | head -n1)"
[ -n "$expected" ] || die "SHA256SUMS.txt does not list ${APPIMAGE_NAME}"
actual="$(sha256sum "$PART" | awk '{print $1}')"
[ "$expected" = "$actual" ] || die "checksum mismatch for ${APPIMAGE_NAME}"
rm -f "$SUMS"

chmod 755 "$PART"
mv -f "$PART" "$APPIMAGE"
trap - EXIT
say "Installed ${APPIMAGE}"

if ( cd "$INSTALL_DIR" \
  && "$APPIMAGE" --appimage-extract 'usr/share/icons/hicolor/512x512/apps/drop-in.png' \
       >/dev/null 2>&1 ); then
  cp "$INSTALL_DIR/squashfs-root/usr/share/icons/hicolor/512x512/apps/drop-in.png" "$ICON"
  rm -rf "$INSTALL_DIR/squashfs-root"
  say "Installed the icon"
else
  say "Could not extract the icon; the desktop entry will use a generic icon"
fi

# The launcher is generic and never version-specific, so a reinstall leaves an
# existing one alone: it may have been edited in the desktop or by hand.
if [ -f "$DESKTOP" ]; then
  say "Kept the existing desktop entry ${DESKTOP}"
else
  exec_path="${APPIMAGE//\\/\\\\}"
  exec_path="${exec_path//\"/\\\"}"
  {
    printf '[Desktop Entry]\n'
    printf 'Type=Application\n'
    printf 'Name=%s\n' "$APP_NAME"
    printf 'Comment=Unofficial Drop-In client for Dropout\n'
    printf 'Exec="%s"\n' "$exec_path"
    if [ -f "$ICON" ]; then
      printf 'Icon=%s\n' "$ICON"
    fi
    printf 'Terminal=false\n'
    printf 'Categories=AudioVideo;Video;\n'
    printf 'StartupWMClass=drop-in\n'
  } > "$DESKTOP"
  chmod 644 "$DESKTOP"
  say "Wrote ${DESKTOP}"
fi

if [ "$ADD_TO_STEAM" -eq 0 ]; then
  say "Skipped the Steam shortcut (--no-steam)"
  exit 0
fi

shortcut_files() {
  find \
    "$HOME/.local/share/Steam/userdata" \
    "$HOME/.steam/steam/userdata" \
    "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/userdata" \
    -path '*/config/shortcuts.vdf' -type f -print0 2>/dev/null || true
}

has_shortcut() {
  grep -a -q -F "$DESKTOP" "$1" 2>/dev/null \
    || grep -a -q -F "$APPIMAGE" "$1" 2>/dev/null
}

shortcut_path=""
shortcut_existed=0
while IFS= read -r -d '' file; do
  if has_shortcut "$file"; then
    shortcut_path="$file"
    shortcut_existed=1
    break
  fi
done < <(shortcut_files)

if [ -z "$shortcut_path" ]; then
  if command -v steamos-add-to-steam >/dev/null 2>&1; then
    say "Adding the Steam shortcut"
    if ! steamos-add-to-steam "$DESKTOP" >/dev/null 2>&1; then
      say "steamos-add-to-steam failed; add it from Steam's Games menu"
    fi
  else
    say "Adding the Steam shortcut through steam://addnonsteamgame"
    touch /tmp/addnonsteamgamefile
    encoded=""
    if command -v python3 >/dev/null 2>&1; then
      encoded="$(python3 -c \
        'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' \
        "$DESKTOP")"
    fi
    if [ -n "$encoded" ]; then
      if command -v steam >/dev/null 2>&1; then
        steam "steam://addnonsteamgame/${encoded}" >/dev/null 2>&1 || true
      else
        xdg-open "steam://addnonsteamgame/${encoded}" >/dev/null 2>&1 || true
      fi
    else
      say "python3 is missing; add the shortcut from Steam's Games menu"
    fi
  fi

  say "Waiting for Steam to write the shortcut"
  for _ in $(seq 1 30); do
    while IFS= read -r -d '' file; do
      if has_shortcut "$file"; then
        shortcut_path="$file"
        break 2
      fi
    done < <(shortcut_files)
    sleep 1
  done
fi

if [ -z "$shortcut_path" ]; then
  say "The shortcut was not found."
  say "Add it in Steam (Games -> Add a Non-Steam Game), then run this script again to apply artwork."
  controller_hint
  exit 0
fi

if [ "$shortcut_existed" -eq 1 ]; then
  # Its name, icon and launch options are the player's; the appid stays valid.
  say "Reusing the existing Steam shortcut"
else
  say "Found the Steam shortcut"
fi
controller_hint
appid=""
if command -v python3 >/dev/null 2>&1; then
  appid="$(python3 - "$shortcut_path" "$DESKTOP" "$APPIMAGE" <<'PY'
import struct
import sys

path, *targets = sys.argv[1:]
data = open(path, 'rb').read()
for target in targets:
    needle = target.encode()
    start = 0
    while True:
        idx = data.find(needle, start)
        if idx < 0:
            break
        marker = data.rfind(b'\x02appid\x00', 0, idx)
        if marker >= 0:
            entry_start = data.rfind(b'\x08\x08', 0, marker)
            if marker > entry_start:
                print(struct.unpack_from('<I', data, marker + 7)[0])
                raise SystemExit(0)
        start = idx + 1
raise SystemExit(1)
PY
)" || true
fi

if [ -z "$appid" ]; then
  say "Could not read the shortcut appid; artwork was skipped"
  exit 0
fi

if ! command -v unzip >/dev/null 2>&1; then
  say "unzip is not installed; artwork was skipped"
  exit 0
fi

say "Applying Steam artwork"
ART="$(mktemp -d)"
if curl -fsSL --retry 3 -o "$ART/steam-art.zip" "${BASE}/steam-art.zip"; then
  unzip -q "$ART/steam-art.zip" -d "$ART"
  GRID="$(dirname "$shortcut_path")/grid"
  mkdir -p "$GRID" "$STATE_DIR"
  rm -f "$ART_MANIFEST.new"
  : > "$ART_MANIFEST.new"
  kept=0
  for pair in \
    "hero.png:${appid}_hero.png" \
    "portrait.png:${appid}p.png" \
    "header.png:${appid}.png" \
    "logo.png:${appid}_logo.png" \
    "icon.png:${appid}_icon.png"; do
    src="${pair%%:*}"
    dst="${pair#*:}"
    if ! install_art "$ART/$src" "$GRID/$dst"; then
      kept=$((kept + 1))
    fi
  done
  mv -f "$ART_MANIFEST.new" "$ART_MANIFEST"
  if [ "$kept" -gt 0 ]; then
    say "Kept ${kept} artwork file(s) you changed or removed in Steam"
    say "Run with --force-art to put the packaged set back"
  fi
  say "Artwork applied"
else
  say "Could not download steam-art.zip; artwork was skipped"
fi
rm -rf "$ART"

say "Done. Switch to Game Mode and launch Drop-In from Non-Steam."
