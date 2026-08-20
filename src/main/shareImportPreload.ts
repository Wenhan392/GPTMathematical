import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gptMathShareImport", {
  importUrl: (url: string, responseId?: string) => ipcRenderer.invoke("share-import:import", url, responseId) as Promise<{
    ok: true;
    message: string;
    responseOptions: Array<{ id: string; label: string }>;
    selectedResponseId: string;
  } | { ok: false; message: string }>
});
