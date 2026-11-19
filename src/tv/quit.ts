import { ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";

export function quitApp(): void {
  ipcRenderer.send(IPC.quit);
}
