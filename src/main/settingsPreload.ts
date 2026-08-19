import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "../shared/types";

contextBridge.exposeInMainWorld("gptMathSettings", {
  load: () => ipcRenderer.invoke("settings:load") as Promise<AppSettings>,
  save: (settings: Partial<AppSettings>) => ipcRenderer.invoke("settings:save", settings) as Promise<AppSettings>
});
