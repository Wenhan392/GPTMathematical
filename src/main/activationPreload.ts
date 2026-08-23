import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gptMathActivation", {
  activate: async (email: string): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("activation:activate", email);
  }
});
