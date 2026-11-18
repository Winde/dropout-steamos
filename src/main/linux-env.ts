/**
 * Steam's on-screen keyboard and Chromium's GTK input method both deliver the
 * same character.
 *
 * Chromium builds its Linux text input on `GtkIMContext`, which picks a module
 * from `GTK_IM_MODULE`. In Game Mode Steam sets its own module, which commits
 * the on-screen keyboard's text while the keyboard's key events are also
 * delivered, so the login fields receive each character twice (`aa` for every
 * `a`).
 *
 * The GTK simple context inserts the key press itself and has no second
 * delivery path. Its module id is the full name, not the `simple` shorthand:
 * GTK only recognises ids it lists as modules, and anything else silently
 * falls back to the desktop's own setting. The on-screen keyboard still types,
 * because it types with plain key events; it only no longer opens by itself
 * when a field takes focus, which is why the sign-in screen asks for
 * STEAM + X.
 *
 * Only Steam's module is replaced. A desktop session's `ibus` types normally
 * and is left alone, as is anything the player picked themselves (fcitx, xim,
 * ...).
 *
 * See https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/4250
 * and https://github.com/ValveSoftware/SteamOS/issues/1039.
 */
const SIMPLE_CONTEXT_ID = "gtk-im-context-simple";
const STEAM_MODULE = "steam";

export function useSimpleInputMethod(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "linux") return;
  if (env["GTK_IM_MODULE"]?.trim().toLowerCase() !== STEAM_MODULE) return;
  env["GTK_IM_MODULE"] = SIMPLE_CONTEXT_ID;
}
