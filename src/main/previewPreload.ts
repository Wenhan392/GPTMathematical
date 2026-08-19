import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gptMathPreview", {
  downloadWord: async (): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:download-word");
  }
});
