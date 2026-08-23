import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "../shared/types";

type QuotaState = { limit: number | null; used: number; remaining: number | null; periodEnd: string | null };
type AccountState = {
  signedIn: boolean;
  email?: string;
  plan: string;
  status: string;
  quota?: QuotaState;
  billingPortalAvailable?: boolean;
  message: string;
};

contextBridge.exposeInMainWorld("gptMathPreview", {
  downloadWord: async (): Promise<{
    ok: boolean;
    message: string;
    account?: AccountState;
  }> => {
    return await ipcRenderer.invoke("preview:download-word");
  },
  downloadPdf: async (): Promise<{
    ok: boolean;
    message: string;
    account?: AccountState;
  }> => {
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
  },
  loadAccount: async (): Promise<AccountState> => {
    return await ipcRenderer.invoke("preview:account-load");
  },
  activateFreeAccount: async (
    email: string
  ): Promise<{
    ok: boolean;
    message: string;
    account: AccountState;
  }> => {
    return await ipcRenderer.invoke("preview:account-activate-free", email);
  },
  openAccountPortal: async (): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:account-open-portal");
  },
  startCheckout: async (
    plan: "plus_monthly" | "plus_yearly" | "lifetime"
  ): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:account-start-checkout", plan);
  },
  openBillingPortal: async (): Promise<{ ok: boolean; message: string }> => {
    return await ipcRenderer.invoke("preview:account-open-billing");
  }
});
