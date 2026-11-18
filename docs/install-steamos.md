# Installing Drop-In on SteamOS (Steam Machine, Steam Deck)

The AppImage is the only published build. SteamOS is image-based: keep
everything in `/home` and do not copy files into `/usr`. What follows lives in
`/home`, so it survives system updates.

## Fast path

In Desktop Mode, with Steam running:

```sh
curl -fsSL https://github.com/Winde/dropout-steamos/releases/latest/download/install.sh | bash
```

Prefer to read it first:

```sh
curl -fsSLO https://github.com/Winde/dropout-steamos/releases/latest/download/install.sh
less install.sh
bash install.sh
```

The script downloads and verifies the AppImage, installs it to
`~/Applications/Drop-In.AppImage`, adds a Steam shortcut, and applies the library
artwork. `--no-steam` installs without the shortcut; `--version vX.Y.Z` pins a
release; `--force-art` replaces artwork you changed in Steam with the packaged
set; `--uninstall` removes the local files. It installs nothing outside
`$HOME`; the only files elsewhere are temporary ones it cleans up.

It cannot choose the controller layout (Steam owns that per-shortcut setting),
so do this once: **Drop-In → Properties → Controller → Gamepad** (or **Gamepad
with Joystick Trackpad**). Use one of those two templates; the app reads a
standard gamepad.

The manual steps below remain as the fallback.

## One-time setup

1. Switch to Desktop Mode: **Steam button → Power → Switch to Desktop**.
2. Download `Drop-In-<version>-x86_64.AppImage` from the latest
   [release](https://github.com/Winde/dropout-steamos/releases).
3. Put it in `~/Applications` (create the folder if it is not there) and make it
   executable. In Dolphin: right-click → **Properties → Permissions → Is
   executable**. Or from a terminal:

   ```sh
   mkdir -p ~/Applications
   mv ~/Downloads/Drop-In-*.AppImage ~/Applications/Drop-In.AppImage
   chmod +x ~/Applications/Drop-In.AppImage
   ```

4. Open Steam in Desktop Mode, then **Games → Add a Non-Steam Game → Browse**
   and pick `~/Applications/Drop-In.AppImage`.
5. Open the new entry's **Properties → Controller** and choose the **Gamepad**
   template (or **Gamepad with Joystick Trackpad**), so the app receives a
   standard gamepad. Leave **Enable the Steam Overlay while in-game** on: Steam
   Input and the on-screen keyboard both depend on it.
6. Return to Game Mode (**Return to Gaming Mode** on the desktop, or Steam →
   Power) and launch Drop-In from the Non-Steam section of your library.

The first launch opens Dropout. If you are not signed in, focus **Sign In**
with the D-pad, then press `STEAM` + `X` for the on-screen keyboard.

## Updates

Drop-In has no in-app updater. Re-run the installer to update: it downloads the
latest release, verifies its checksum and replaces
`~/Applications/Drop-In.AppImage` in place, so the Steam entry and its appid stay
valid. Downloading the new AppImage over the old file at the same path works
too.

The installer detects the existing Steam shortcut instead of adding a second
one, and does not touch what Steam stores for it: a renamed entry, a chosen
controller layout and library artwork you replaced or removed stay as they are.
Artwork it installed itself is refreshed on update. Use `--force-art` to put the
packaged hero, logo, header and icons back. The desktop entry is also only
written when it does not exist.

## Launch options

In Game Mode Steam sets the variables the app already uses to start fullscreen.
If you launch it from Desktop Mode and want it fullscreen, add `--fullscreen` to
the shortcut's launch options.

Game Mode also sets `GTK_IM_MODULE=Steam`, whose input method delivers the
on-screen keyboard's text twice. The app replaces that one value with GTK's
simple context before Chromium starts, so typing lands once; a desktop session's
`ibus` and any module you set yourself are left alone. Do not pin
`GTK_IM_MODULE` in the shortcut's launch options: the app then keeps your value
and cannot make that fix.

## If it will not start

- **"Cannot mount AppImage"**: FUSE is unhappy. Add
  `--appimage-extract-and-run` to the Steam entry's launch options.
- **Nothing happens**: check the file is executable (`chmod +x`), and try
  launching it once from Desktop Mode to see the error.
- **`chrome-sandbox` permission error**: add `--no-sandbox` to the launch
  options. In Game Mode the app sets this itself.
- **A/B do nothing**: confirm the shortcut uses **Gamepad** or **Gamepad with
  Joystick Trackpad** in **Properties → Controller**. The app reads a real
  gamepad, not key presses.
- **Controller does nothing at all**: check the same setting and make sure the
  Steam Overlay is enabled.
- **Wrong icon or name in the library**: edit the entry's properties in Desktop
  Mode; Steam remembers it.

## Library art

The installer applies the project's own artwork, built from the Iconoir `sofa`
icon. For community art, use the SteamGridDB Decky plugin or set it manually in
Desktop Mode; this project does not bundle or download third-party art.
