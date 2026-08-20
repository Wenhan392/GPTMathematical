import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "../shared/types";

contextBridge.exposeInMainWorld("gptMathPreview", {
  downloadWord: async (): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:download-word");
  },
  downloadPdf: async (): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:download-pdf");
  },
  importShare: async (
    url: string,
    responseId?: string
  ): Promise<{
    ok: boolean;
    message: string;
    responseOptions?: Array<{ id: string; label: string }>;
    selectedResponseId?: string;
  }> => {
    return await ipcRenderer.invoke("preview:import-share", url, responseId);
  },
  loadSettings: async (): Promise<AppSettings> => {
    return await ipcRenderer.invoke("settings:load");
  },
  saveSettings: async (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return await ipcRenderer.invoke("settings:save", settings);
  }
});
