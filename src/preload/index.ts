import { run } from "../tv/run";
import { applyEarlyMods } from "../tv/mods/runtime";

function start(): void {
  void run().catch((error) => {
    console.error("[dropin] TV layer failed", error);
  });
}

if (process.isMainFrame) {
  applyEarlyMods();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
