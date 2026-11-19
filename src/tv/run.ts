import { getCurrent } from "./focus";
import { startInput, type Action } from "./input";
import { pageKind } from "./page";
import { startMods, type ModRuntime } from "./mods/runtime";

let runtime: ModRuntime | null = null;

function handleAction(action: Action): void {
  if (runtime?.action(action)) return;

  switch (action) {
    case "back":
      if (history.length > 1) history.back();
      else location.assign("/browse");
      break;
    case "select":
      getCurrent()?.click();
      break;
    case "menu":
      break;
    case "up":
    case "down":
    case "left":
    case "right":
      runtime?.navigate(action);
      break;
    default:
      break;
  }
}

export async function run(): Promise<void> {
  const key = "__dropinTv";
  if ((window as unknown as Record<string, unknown>)[key]) return;
  (window as unknown as Record<string, unknown>)[key] = true;

  const kind = pageKind(location.pathname);
  document.documentElement.classList.add(`dropin-${kind}`);

  runtime = startMods(kind);
  startInput({ watchMode: kind === "watch", onAction: handleAction });
  runtime.focus();
}
