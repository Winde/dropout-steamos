import { ipcRenderer } from "electron";

export function quitApp(): void {
  ipcRenderer.send("dropin:quit");
}
