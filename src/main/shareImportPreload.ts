import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gptMathShareImport", {
  importUrl: (url: string) => ipcRenderer.invoke("share-import:import", url) as Promise<{ ok: true; message: string } | { ok: false; message: string }>
});
