import { ipcRenderer } from "electron";

export function quitApp(): void {
  ipcRenderer.send("couch:quit");
}
