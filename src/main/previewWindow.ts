import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import type { AccountState, ExternalUrlResult, PaidPlanId } from "./licenseStore";

export interface ClipboardPreviewContent {
  title: string;
  status: string;
  html: string;
  plainText: string;
  warnings: string[];
  canDownloadWord?: boolean;
  stabilizeRender?: boolean;
  shareUrl?: string;
  responseOptions?: ShareResponseOption[];
  selectedResponseId?: string;
}

export interface ShareResponseOption {
  id: string;
  label: string;
}

export interface PreviewShareImportResult {
  message: string;
  responseOptions: ShareResponseOption[];
  selectedResponseId: string;
}

export interface PreviewExportResult {
  ok?: boolean;
  message: string;
  account: AccountState;
}

export interface PreviewIpcHandlers {
  downloadWord: () => Promise<PreviewExportResult>;
  downloadPdf: () => Promise<PreviewExportResult>;
  importShare: (url: string, responseId?: string) => Promise<PreviewShareImportResult>;
  loadAccount: () => Promise<AccountState> | AccountState;
  activateFreeAccount: (email: string) => Promise<{ ok: boolean; message: string; account: AccountState }>;
  openAccountPortal: () => Promise<string>;
  startCheckout: (plan: PaidPlanId) => Promise<ExternalUrlResult>;
  openBillingPortal: () => Promise<ExternalUrlResult>;
}

export class ClipboardPreviewController {
  private window: BrowserWindow | undefined;
  private renderVersion = 0;

  show(content: ClipboardPreviewContent): void {
    this.renderVersion += 1;
    const renderVersion = this.renderVersion;

    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 900,
        minHeight: 620,
        title: "GPT Mathematical",
        webPreferences: {
          preload: path.join(__dirname, "previewPreload.js"),
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      this.window.on("closed", () => {
        this.window = undefined;
      });
    }

    const previewHtml = makePreviewHtml(content);
    this.loadPreviewHtml(previewHtml, renderVersion);
    if (content.stabilizeRender) {
      setTimeout(() => {
        if (!this.window || this.window.isDestroyed() || renderVersion !== this.renderVersion) {
          return;
        }

        this.loadPreviewHtml(previewHtml, renderVersion);
      }, 250);
    }
    this.window.once("ready-to-show", () => this.window?.show());
    this.window.focus();
  }

  private loadPreviewHtml(html: string, renderVersion: number): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const previewFilePath = path.join(app.getPath("userData"), "preview.html");
    fs.mkdirSync(path.dirname(previewFilePath), { recursive: true });
    fs.writeFileSync(previewFilePath, html, "utf8");
    void this.window.loadFile(previewFilePath, { query: { v: String(renderVersion) } });
  }
}

export function registerPreviewIpc(handlers: PreviewIpcHandlers): void {
  ipcMain.handle("preview:download-word", async () => {
    try {
      const result = await handlers.downloadWord();
      return { ...result, ok: result.ok ?? true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save the Word document.",
        account: await handlers.loadAccount()
      };
    }
  });

  ipcMain.handle("preview:download-pdf", async () => {
    try {
      const result = await handlers.downloadPdf();
      return { ...result, ok: result.ok ?? true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save the PDF document.",
        account: await handlers.loadAccount()
      };
    }
  });

  ipcMain.handle("preview:import-share", async (_event, url: string, responseId?: string) => {
    try {
      const result = await handlers.importShare(url, responseId);
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not import the shared conversation."
      };
    }
  });

  ipcMain.handle("preview:account-load", async () => handlers.loadAccount());
  ipcMain.handle("preview:account-activate-free", async (_event, email: string) => {
    try {
      return await handlers.activateFreeAccount(email);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not start free account.",
        account: await handlers.loadAccount()
      };
    }
  });
  ipcMain.handle("preview:account-open-portal", async () => ({ ok: true, message: await handlers.openAccountPortal() }));
  ipcMain.handle("preview:account-start-checkout", async (_event, plan: PaidPlanId) => handlers.startCheckout(plan));
  ipcMain.handle("preview:account-open-billing", async () => handlers.openBillingPortal());
}

function makePreviewHtml(content: ClipboardPreviewContent): string {
  const warnings = content.warnings.length
    ? `<div class="warnings">${content.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}</div>`
    : "";
  const canDownloadWord = content.canDownloadWord !== false;
  const actions = [
    `<button class="secondary-button" id="download-word" type="button"${canDownloadWord ? "" : " disabled"}>Download Word file</button>`,
    `<button class="secondary-button" id="download-pdf" type="button"${canDownloadWord ? "" : " disabled"}>Download PDF file</button>`,
    `<span class="quota-pill" id="quota-pill">Checking access...</span>`,
    `<span id="download-status">${canDownloadWord ? "" : "Select a smaller import to export."}</span>`
  ].join("");

  const previewHtml = content.html || emptyPreviewHtml(content.plainText);
  const previewState = scriptJson({
    shareUrl: content.shareUrl ?? "",
    responseOptions: content.responseOptions ?? [],
    selectedResponseId: content.selectedResponseId ?? "all"
  });
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Clipboard Preview</title>
<style>
html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  color: #172033;
  background: #eef3f9;
  font-family: "Segoe UI", Arial, sans-serif;
}
body {
  display: grid;
  min-height: 100vh;
}
.app-shell {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  position: relative;
  padding: 18px 12px;
  background: #ffffff;
  border-right: 1px solid #d8e0eb;
  box-shadow: 4px 0 24px rgba(15, 23, 42, 0.05);
}
.sidebar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(14, 165, 233, 0));
  pointer-events: none;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 4px 20px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}
.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #172033;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
  position: relative;
  flex: 0 0 auto;
}
.brand-mark::before,
.brand-mark::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: #ffffff;
}
.brand-mark::before {
  top: 10px;
}
.brand-mark::after {
  top: 17px;
  right: 13px;
}
.nav {
  display: grid;
  gap: 6px;
}
.nav-button {
  width: 100%;
  height: 40px;
  justify-content: flex-start;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #44546a;
  background: transparent;
  box-shadow: none;
  font: 730 13px/1 "Segoe UI", Arial, sans-serif;
  text-align: left;
}
.nav-button:hover {
  border-color: #d8e0eb;
  color: #172033;
  background: #f5f8fc;
}
.nav-button.active {
  border-color: #dbeafe;
  color: #1d4ed8;
  background: #eff6ff;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.08);
}
.nav-icon {
  width: 18px;
  text-align: center;
  color: inherit;
  font-size: 14px;
  font-weight: 900;
}
.content-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  min-height: 0;
}
.topbar {
  padding: 18px 24px 14px;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid #d8e0eb;
  backdrop-filter: blur(14px);
}
.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 760;
}
.brand-tag {
  padding: 4px 8px;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  color: #166534;
  background: #f0fdf4;
  font-size: 11px;
  font-weight: 760;
  white-space: nowrap;
}
h1 {
  margin: 8px 0 0;
  min-width: 0;
  color: #0f172a;
  font-size: 20px;
  font-weight: 760;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}
button {
  height: 34px;
  padding: 0 13px;
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  color: #ffffff;
  background: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  font: 730 12px/1 "Segoe UI", Arial, sans-serif;
  white-space: nowrap;
}
button:hover {
  background: #1d4ed8;
}
button:disabled {
  border-color: #94a3b8;
  background: #94a3b8;
  box-shadow: none;
}
.secondary-button {
  border-color: #c8d2df;
  color: #1f2937;
  background: #ffffff;
}
.secondary-button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}
.export-locked {
  border-color: #cbd5e1;
  color: #64748b;
  background: #f8fafc;
}
.export-locked:hover {
  border-color: #94a3b8;
  color: #334155;
  background: #eef2f7;
}
#download-status {
  max-width: 260px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;
}
.quota-pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  max-width: 230px;
  padding: 0 9px;
  border: 1px solid #c8d2df;
  border-radius: 999px;
  color: #334155;
  background: #f8fafc;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  white-space: nowrap;
}
.quota-pill.free {
  border-color: #bfdbfe;
  color: #1d4ed8;
  background: #eff6ff;
}
.quota-pill.unlimited {
  border-color: #bbf7d0;
  color: #166534;
  background: #f0fdf4;
}
.quota-pill.blocked {
  border-color: #fecaca;
  color: #991b1b;
  background: #fef2f2;
}
.status {
  margin-top: 7px;
  max-width: 840px;
  color: #4b5d72;
  font-size: 13px;
  line-height: 1.45;
}
.import-panel {
  padding: 13px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(190px, 270px) auto;
  gap: 11px;
  align-items: end;
  border: 1px solid #d8e0eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}
.field {
  min-width: 0;
}
label {
  display: block;
  margin-bottom: 6px;
  color: #334155;
  font-size: 11px;
  font-weight: 760;
  text-transform: uppercase;
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 8px 10px;
  border: 1px solid #c5cfdd;
  border-radius: 6px;
  color: #111827;
  background: #ffffff;
  font: 13px/1.2 "Segoe UI", Arial, sans-serif;
}
input:focus,
select:focus {
  outline: 3px solid #bfdbfe;
  border-color: #2563eb;
}
.response-field {
  display: none;
}
.response-field.visible {
  display: block;
}
#import-share {
  height: 36px;
}
#import-status {
  grid-column: 1 / -1;
  min-height: 17px;
  color: #5f7085;
  font-size: 12px;
  line-height: 1.35;
}
#import-status.error {
  color: #991b1b;
}
#import-status.ok {
  color: #166534;
}
main {
  padding: 18px 24px 24px;
  min-height: 0;
  overflow: auto;
}
.tab-panel {
  display: none;
}
.tab-panel.active {
  display: grid;
  gap: 16px;
}
.home-grid {
  display: grid;
  grid-template-rows: auto minmax(330px, 1fr) minmax(180px, 0.45fr);
  gap: 16px;
  min-height: calc(100vh - 152px);
}
.home-top {
  display: grid;
  gap: 10px;
}
section {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 13px;
  border: 1px solid #d8e0eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.content-card {
  display: block;
  min-height: auto;
}
.content-card h2 {
  margin: 0 0 8px;
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
}
.content-card p {
  margin: 0 0 12px;
  color: #4b5d72;
  font-size: 13px;
  line-height: 1.55;
}
.history-list,
.qa-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.history-item,
.qa-item,
.settings-group {
  padding: 12px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #fbfcfe;
}
.history-title,
.qa-title {
  margin-bottom: 4px;
  color: #172033;
  font-size: 13px;
  font-weight: 800;
}
.meta-line {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.settings-grid {
  display: grid;
  gap: 12px;
  max-width: 720px;
}
.setting-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
}
.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
}
.setting-row input[type="number"] {
  max-width: 180px;
}
.setting-title {
  margin-bottom: 3px;
  color: #172033;
  font-size: 13px;
  font-weight: 800;
}
.setting-help {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.settings-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
#settings-state {
  color: #64748b;
  font-size: 12px;
}
#settings-state.ok {
  color: #166534;
}
#settings-state.error {
  color: #991b1b;
}
.account-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.95fr) minmax(300px, 1.05fr);
  gap: 14px;
}
.account-card {
  padding: 13px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #fbfcfe;
}
.account-card h3 {
  margin: 0 0 8px;
  color: #172033;
  font-size: 13px;
  font-weight: 800;
}
.quota-meter {
  height: 8px;
  margin: 10px 0 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}
.quota-meter span {
  display: block;
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}
.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.plan-card {
  display: flex;
  flex-direction: column;
  min-height: 190px;
  padding: 12px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #fbfcfe;
}
.plan-card.featured {
  border-color: #2563eb;
  background: #eff6ff;
}
.plan-card h3 {
  margin: 0;
  color: #172033;
  font-size: 13px;
  font-weight: 800;
}
.plan-price {
  margin-top: 8px;
  color: #0f172a;
  font-size: 23px;
  font-weight: 850;
}
.plan-price small {
  margin-left: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.plan-card p {
  margin: 8px 0 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.plan-card ul {
  display: grid;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.plan-card li {
  color: #44546a;
  font-size: 11px;
  line-height: 1.35;
}
.plan-card li::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 999px;
  background: #2563eb;
  vertical-align: 1px;
}
.plan-card button {
  width: 100%;
  margin-top: auto;
}
.account-form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.account-status {
  min-height: 18px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.account-status.ok {
  color: #166534;
}
.account-status.error {
  color: #991b1b;
}
.section-title {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #243449;
  font-size: 12px;
  font-weight: 780;
  text-transform: uppercase;
}
.section-title span:last-child {
  color: #64748b;
  font-weight: 700;
}
iframe,
pre {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #ffffff;
}
iframe {
  overflow: auto;
}
pre {
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #1f2937;
  background: #fbfcfe;
  font: 12px/1.45 Consolas, "Cascadia Mono", monospace;
}
.warnings {
  margin: 0;
  padding: 9px 11px;
  border: 1px solid #f6c453;
  border-radius: 6px;
  color: #7c2d12;
  background: #fffbeb;
  font-size: 12px;
  line-height: 1.4;
}
@media (max-width: 940px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 10px 12px;
    border-right: 0;
    border-bottom: 1px solid #d8e0eb;
  }

  .sidebar-brand {
    margin-bottom: 10px;
  }

  .nav {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .nav-button {
    justify-content: center;
  }

  .header-row {
    display: block;
  }

  .actions {
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .import-panel {
    grid-template-columns: 1fr;
  }

  .home-grid {
    min-height: auto;
  }

  .plans-grid,
  .account-grid {
    grid-template-columns: 1fr;
  }
}
</style>
</head>
<body>
<div class="app-shell">
  <aside class="sidebar" aria-label="Main navigation">
    <div class="sidebar-brand"><span class="brand-mark"></span><span>GPT Mathematical</span></div>
    <nav class="nav">
      <button class="nav-button active" type="button" data-tab="home"><span class="nav-icon">H</span><span>Home</span></button>
      <button class="nav-button" type="button" data-tab="history"><span class="nav-icon">R</span><span>History</span></button>
      <button class="nav-button" type="button" data-tab="account"><span class="nav-icon">A</span><span>Account</span></button>
      <button class="nav-button" type="button" data-tab="settings"><span class="nav-icon">S</span><span>Settings</span></button>
      <button class="nav-button" type="button" data-tab="info"><span class="nav-icon">I</span><span>Info</span></button>
    </nav>
  </aside>
  <div class="content-shell">
    <header class="topbar">
      <div class="header-row">
        <div>
          <div class="brand"><span>Clipboard and ChatGPT share import</span><span class="brand-tag">Local</span></div>
          <h1>${escapeHtml(content.title)}</h1>
        </div>
        <div class="actions">${actions}</div>
      </div>
      <div class="status">${escapeHtml(content.status)}</div>
    </header>
    <main>
      <div id="tab-home" class="tab-panel active">
        <div class="home-grid">
          <div class="home-top">
            <div class="import-panel">
              <div class="field">
                <label for="share-url">ChatGPT share link</label>
                <input id="share-url" type="url" placeholder="https://chatgpt.com/share/...">
              </div>
              <div id="response-field" class="field response-field">
                <label for="share-response">Export content</label>
                <select id="share-response"></select>
              </div>
              <button id="import-share" type="button">Import</button>
              <div id="import-status">Copy a ChatGPT share link for automatic import, paste one here, or keep using this window as your clipboard preview.</div>
            </div>
            ${warnings}
          </div>
          <section>
            <div class="section-title"><span>Formatted Paste Preview</span><span>what Word/Docs/OneNote should receive</span></div>
            <iframe sandbox srcdoc="${escapeAttribute(previewHtml)}"></iframe>
          </section>
          <section>
            <div class="section-title"><span>Plain Text Fallback</span><span>${content.plainText.length.toLocaleString()} characters</span></div>
            <pre>${escapeHtml(content.plainText || "Clipboard has no plain text.")}</pre>
          </section>
        </div>
      </div>
      <div id="tab-history" class="tab-panel">
        <section class="content-card">
          <h2>History</h2>
          <p>Recent clipboard and import activity for this window. The app stays local, so this view keeps the current item visible without creating an account or cloud history.</p>
          <div class="history-list">
            <div class="history-item">
              <div class="history-title">${escapeHtml(content.title)}</div>
              <div class="meta-line">${escapeHtml(content.status)}</div>
              <div class="meta-line">${content.plainText.length.toLocaleString()} plain-text characters${content.shareUrl ? ` from ${escapeHtml(content.shareUrl)}` : ""}</div>
            </div>
          </div>
        </section>
      </div>
      <div id="tab-settings" class="tab-panel">
        <section class="content-card">
          <h2>Settings</h2>
          <p>These settings are saved locally on this computer and apply to clipboard watching, previews, and imports.</p>
          <div class="settings-grid">
            <div class="settings-group setting-row">
              <div>
                <div class="setting-title">Auto-fix clipboard content</div>
                <div class="setting-help">When enabled, eligible math, Markdown, STEM text, and copied ChatGPT share links are processed automatically.</div>
              </div>
              <input id="setting-enabled" type="checkbox">
            </div>
            <div class="settings-group setting-row">
              <div>
                <div class="setting-title">Show toast messages</div>
                <div class="setting-help">Briefly show success and error notifications while the tray app runs.</div>
              </div>
              <input id="setting-show-toasts" type="checkbox">
            </div>
            <div class="settings-group setting-row">
              <div>
                <div class="setting-title">Show preview window</div>
                <div class="setting-help">Open this window when converted content or clipboard debug content is available.</div>
              </div>
              <input id="setting-show-preview" type="checkbox">
            </div>
            <div class="settings-group setting-row">
              <div>
                <div class="setting-title">Convert diagrams</div>
                <div class="setting-help">Render supported Mermaid diagrams during rich conversion when possible.</div>
              </div>
              <input id="setting-convert-diagrams" type="checkbox">
            </div>
            <div class="settings-group setting-row">
              <div>
                <div class="setting-title">Clipboard size limit</div>
                <div class="setting-help">Large content is shown as a safe error/debug preview instead of freezing the app.</div>
              </div>
              <input id="setting-max-chars" type="number" min="1000" max="300000" step="1000">
            </div>
          </div>
          <div class="settings-footer">
            <button id="save-settings" type="button">Save settings</button>
            <span id="settings-state">Loading settings...</span>
          </div>
        </section>
      </div>
      <div id="tab-account" class="tab-panel">
        <section class="content-card">
          <h2>Account</h2>
          <p>Start a free account once in this app to unlock 15 Word/PDF exports each month. Paid upgrades use secure Stripe Checkout and refresh here automatically.</p>
          <div class="account-grid">
            <div class="account-card">
              <h3>Current access</h3>
              <div class="meta-line" id="account-plan">Loading account...</div>
              <div class="quota-meter" id="quota-meter"><span></span></div>
              <div class="meta-line" id="account-quota"></div>
              <div class="account-actions">
                <button class="secondary-button" id="open-account" type="button">Refresh account</button>
                <button class="secondary-button" id="open-billing" type="button">Manage billing</button>
              </div>
            </div>
            <div class="account-card">
              <h3>Start free account</h3>
              <div class="account-form">
                <div class="field">
                  <label for="account-email">Account email</label>
                  <input id="account-email" type="email" placeholder="you@example.com">
                </div>
                <div class="account-actions">
                  <button id="activate-free-account" type="button">Start free plan</button>
                </div>
                <div class="account-status" id="account-status">Enter your email to start free exports. Upgrade from this screen whenever you need unlimited exports.</div>
              </div>
            </div>
          </div>
          <div class="plans-grid" aria-label="Upgrade plans">
            <div class="plan-card featured">
              <h3>Plus Monthly</h3>
              <div class="plan-price">$2<small>/month</small></div>
              <p>Best first upgrade for regular document exports.</p>
              <ul>
                <li>Unlimited Word exports</li>
                <li>Unlimited PDF exports</li>
                <li>Cancel from billing portal</li>
              </ul>
              <button class="upgrade-button" data-checkout-plan="plus_monthly" type="button">Upgrade to Plus</button>
            </div>
            <div class="plan-card">
              <h3>Plus Yearly</h3>
              <div class="plan-price">$20<small>/year</small></div>
              <p>For daily use at the best subscription value.</p>
              <ul>
                <li>Unlimited Word exports</li>
                <li>Unlimited PDF exports</li>
                <li>Lower yearly price</li>
              </ul>
              <button class="secondary-button upgrade-button" data-checkout-plan="plus_yearly" type="button">Upgrade yearly</button>
            </div>
            <div class="plan-card">
              <h3>Lifetime</h3>
              <div class="plan-price">$30<small>once</small></div>
              <p>For early buyers who prefer one payment.</p>
              <ul>
                <li>Unlimited Word exports</li>
                <li>Unlimited PDF exports</li>
                <li>Lifetime updates for v1</li>
              </ul>
              <button class="secondary-button upgrade-button" data-checkout-plan="lifetime" type="button">Buy lifetime</button>
            </div>
          </div>
        </section>
      </div>
      <div id="tab-info" class="tab-panel">
        <section class="content-card">
          <h2>Info</h2>
          <p>GPT Mathematical converts copied ChatGPT-style math, Markdown, tables, and imported share chats into paste-friendly formats for Word, Google Docs, OneNote, PDF, and plain text fallback.</p>
          <div class="qa-list">
            <div class="qa-item">
              <div class="qa-title">Privacy policy</div>
              <div class="meta-line">Conversion runs locally. Clipboard text and imported share content are not sent to a custom cloud service by this app.</div>
            </div>
            <div class="qa-item">
              <div class="qa-title">What happens when I copy a ChatGPT share link?</div>
              <div class="meta-line">The clipboard watcher detects supported share URLs and imports the chat automatically. You can still paste a link manually on Home.</div>
            </div>
            <div class="qa-item">
              <div class="qa-title">Can exported equations stay editable?</div>
              <div class="meta-line">The current goal is high visual fidelity in Word and PDF exports. Some destinations may paste equations as rendered content instead of native editable equations.</div>
            </div>
            <div class="qa-item">
              <div class="qa-title">What if a chat is too large?</div>
              <div class="meta-line">The app avoids converting oversized content at once and lets you select smaller responses for export.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</div>
<script>
const previewState = ${previewState};
const canExportCurrentContent = ${canDownloadWord ? "true" : "false"};
const downloadButton = document.getElementById("download-word");
const pdfButton = document.getElementById("download-pdf");
const downloadStatus = document.getElementById("download-status");
const quotaPill = document.getElementById("quota-pill");
const shareUrl = document.getElementById("share-url");
const importButton = document.getElementById("import-share");
const importStatus = document.getElementById("import-status");
const responseField = document.getElementById("response-field");
const responseSelect = document.getElementById("share-response");
const navButtons = Array.from(document.querySelectorAll(".nav-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const settingsFields = {
  enabled: document.getElementById("setting-enabled"),
  showToasts: document.getElementById("setting-show-toasts"),
  showPreviewOnConvert: document.getElementById("setting-show-preview"),
  convertDiagrams: document.getElementById("setting-convert-diagrams"),
  maxClipboardChars: document.getElementById("setting-max-chars")
};
const saveSettingsButton = document.getElementById("save-settings");
const settingsState = document.getElementById("settings-state");
const accountPlan = document.getElementById("account-plan");
const accountQuota = document.getElementById("account-quota");
const quotaMeter = document.querySelector("#quota-meter span");
const accountEmail = document.getElementById("account-email");
const activateFreeAccountButton = document.getElementById("activate-free-account");
const accountStatus = document.getElementById("account-status");
const openAccountButton = document.getElementById("open-account");
const openBillingButton = document.getElementById("open-billing");
const checkoutButtons = Array.from(document.querySelectorAll("[data-checkout-plan]"));
let lastImportedUrl = previewState.shareUrl || "";
let currentAccount = null;
let checkoutPollTimer = 0;

if (shareUrl) {
  shareUrl.value = previewState.shareUrl || "";
}
updateResponseOptions(previewState.responseOptions || [], previewState.selectedResponseId || "all");
loadPreviewSettings();
loadAccountState();

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.getAttribute("data-tab");
    selectTab(tab);
  });
});

if (downloadButton && downloadStatus) {
  downloadButton.addEventListener("click", async () => {
    const blocked = exportLockMessage(currentAccount);
    if (blocked) {
      downloadStatus.textContent = blocked;
      if (accountStatus) {
        accountStatus.className = "account-status";
        accountStatus.textContent = blocked;
      }
      selectTab("account");
      return;
    }

    downloadButton.disabled = true;
    if (pdfButton) pdfButton.disabled = true;
    downloadStatus.textContent = "Saving...";
    const result = await window.gptMathPreview.downloadWord();
    downloadStatus.textContent = result.message;
    if (result.account) {
      renderAccountState(result.account);
    }
    if (!result.ok) {
      selectTab("account");
    }
    downloadButton.disabled = false;
    if (pdfButton) pdfButton.disabled = false;
    updateExportButtons(currentAccount);
  });
}

if (pdfButton && downloadStatus) {
  pdfButton.addEventListener("click", async () => {
    const blocked = exportLockMessage(currentAccount);
    if (blocked) {
      downloadStatus.textContent = blocked;
      if (accountStatus) {
        accountStatus.className = "account-status";
        accountStatus.textContent = blocked;
      }
      selectTab("account");
      return;
    }

    pdfButton.disabled = true;
    if (downloadButton) downloadButton.disabled = true;
    downloadStatus.textContent = "Saving PDF...";
    const result = await window.gptMathPreview.downloadPdf();
    downloadStatus.textContent = result.message;
    if (result.account) {
      renderAccountState(result.account);
    }
    if (!result.ok) {
      selectTab("account");
    }
    pdfButton.disabled = false;
    if (downloadButton) downloadButton.disabled = false;
    updateExportButtons(currentAccount);
  });
}
if (importButton && importStatus && shareUrl) {
  importButton.addEventListener("click", async () => {
    const url = shareUrl.value.trim();
    if (!url) {
      importStatus.className = "error";
      importStatus.textContent = "Paste a ChatGPT shared conversation URL first.";
      return;
    }

    importButton.disabled = true;
    importStatus.className = "";
    importStatus.textContent = "Importing shared conversation...";

    const result = await window.gptMathPreview.importShare(url, responseSelect?.value || undefined);
    importStatus.className = result.ok ? "ok" : "error";
    importStatus.textContent = result.message;
    importButton.disabled = false;

    if (result.ok) {
      lastImportedUrl = url;
      updateResponseOptions(result.responseOptions || [], result.selectedResponseId || "all");
    }
  });

  shareUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      importButton.click();
    }
  });
}
if (responseSelect) {
  responseSelect.addEventListener("change", () => {
    if (lastImportedUrl && !importButton?.disabled) {
      importButton?.click();
    }
  });
}
if (saveSettingsButton && settingsState) {
  saveSettingsButton.addEventListener("click", async () => {
    saveSettingsButton.disabled = true;
    settingsState.className = "";
    settingsState.textContent = "Saving settings...";
    try {
      const settings = await window.gptMathPreview.saveSettings({
        enabled: Boolean(settingsFields.enabled?.checked),
        showToasts: Boolean(settingsFields.showToasts?.checked),
        showPreviewOnConvert: Boolean(settingsFields.showPreviewOnConvert?.checked),
        convertDiagrams: Boolean(settingsFields.convertDiagrams?.checked),
        maxClipboardChars: Number(settingsFields.maxClipboardChars?.value)
      });
      applySettings(settings);
      settingsState.className = "ok";
      settingsState.textContent = "Settings saved.";
    } catch (error) {
      settingsState.className = "error";
      settingsState.textContent = "Could not save settings.";
    } finally {
      saveSettingsButton.disabled = false;
    }
  });
}
if (activateFreeAccountButton && accountEmail && accountStatus) {
  activateFreeAccountButton.addEventListener("click", async () => {
    activateFreeAccountButton.disabled = true;
    accountStatus.className = "account-status";
    accountStatus.textContent = "Starting free plan...";
    const result = await window.gptMathPreview.activateFreeAccount(accountEmail.value);
    accountStatus.className = result.ok ? "account-status ok" : "account-status error";
    accountStatus.textContent = result.message;
    renderAccountState(result.account);
    activateFreeAccountButton.disabled = false;
  });
}
if (openAccountButton && accountStatus) {
  openAccountButton.addEventListener("click", async () => {
    openAccountButton.disabled = true;
    accountStatus.className = "account-status";
    accountStatus.textContent = "Refreshing account...";
    await loadAccountState();
    accountStatus.textContent = currentAccount?.message || "Account refreshed.";
    openAccountButton.disabled = false;
  });
}
if (openBillingButton && accountStatus) {
  openBillingButton.addEventListener("click", async () => {
    openBillingButton.disabled = true;
    accountStatus.className = "account-status";
    accountStatus.textContent = "Opening billing...";
    const result = await window.gptMathPreview.openBillingPortal();
    accountStatus.className = result.ok ? "account-status ok" : "account-status error";
    accountStatus.textContent = result.message;
    openBillingButton.disabled = false;
  });
}
checkoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const plan = button.getAttribute("data-checkout-plan");
    if (!plan || !accountStatus) {
      return;
    }

    if (!currentAccount?.signedIn) {
      accountStatus.className = "account-status error";
      accountStatus.textContent = "Start your free account first, then upgrade in one click.";
      accountEmail?.focus();
      return;
    }

    checkoutButtons.forEach((item) => item.disabled = true);
    accountStatus.className = "account-status";
    accountStatus.textContent = "Opening secure checkout...";
    const result = await window.gptMathPreview.startCheckout(plan);
    accountStatus.className = result.ok ? "account-status ok" : "account-status error";
    accountStatus.textContent = result.ok
      ? "Checkout opened. This screen will refresh after payment."
      : result.message;
    checkoutButtons.forEach((item) => item.disabled = false);
    if (result.ok) {
      startCheckoutPolling();
    }
  });
});

function selectTab(tab) {
  if (!tab) {
    return;
  }

  navButtons.forEach((item) => item.classList.toggle("active", item.getAttribute("data-tab") === tab));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === "tab-" + tab));
}

function updateResponseOptions(options, selectedId) {
  if (!responseField || !responseSelect || !importButton) {
    return;
  }

  if (!options || options.length <= 1) {
    responseField.className = "field response-field";
    responseSelect.innerHTML = "";
    importButton.textContent = "Import";
    return;
  }

  const previous = responseSelect.value || selectedId;
  responseSelect.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = option.label;
    responseSelect.appendChild(item);
  });
  responseSelect.value = options.some((option) => option.id === selectedId)
    ? selectedId
    : options.some((option) => option.id === previous)
    ? previous
    : "all";
  responseField.className = "field response-field visible";
  importButton.textContent = responseSelect.value === "all" ? "Import whole chat" : "Import selected response";
}

async function loadPreviewSettings() {
  if (!settingsState) {
    return;
  }

  try {
    const settings = await window.gptMathPreview.loadSettings();
    applySettings(settings);
    settingsState.textContent = "Settings are stored locally.";
  } catch (error) {
    settingsState.className = "error";
    settingsState.textContent = "Could not load settings.";
  }
}

function applySettings(settings) {
  if (settingsFields.enabled) settingsFields.enabled.checked = Boolean(settings.enabled);
  if (settingsFields.showToasts) settingsFields.showToasts.checked = Boolean(settings.showToasts);
  if (settingsFields.showPreviewOnConvert) settingsFields.showPreviewOnConvert.checked = Boolean(settings.showPreviewOnConvert);
  if (settingsFields.convertDiagrams) settingsFields.convertDiagrams.checked = Boolean(settings.convertDiagrams);
  if (settingsFields.maxClipboardChars) settingsFields.maxClipboardChars.value = String(settings.maxClipboardChars);
}

async function loadAccountState() {
  try {
    const account = await window.gptMathPreview.loadAccount();
    renderAccountState(account);
  } catch (error) {
    if (accountPlan) accountPlan.textContent = "Account unavailable.";
  }
}

function renderAccountState(account) {
  if (!accountPlan || !accountQuota || !quotaMeter) {
    return;
  }

  currentAccount = account;
  if (accountEmail && account.email) accountEmail.value = account.email;

  const planName = account.plan === "plus_subscription"
    ? "Plus"
    : account.plan === "lifetime"
    ? "Lifetime"
    : account.plan === "free"
    ? "Free"
    : "Signed out";
  if (openBillingButton) {
    openBillingButton.disabled = !account.billingPortalAvailable;
  }
  accountPlan.textContent = account.signedIn
    ? planName + " - " + account.status + ". " + account.message
    : account.message;
  renderQuotaPill(account);
  updateExportButtons(account);

  if (!account.quota) {
    accountQuota.textContent = "Start a free account before exporting Word/PDF files.";
    quotaMeter.style.width = "0%";
    return;
  }

  if (account.quota.limit === null) {
    accountQuota.textContent = "Unlimited Word and PDF exports.";
    quotaMeter.style.width = "100%";
    return;
  }

  const used = Number(account.quota.used || 0);
  const limit = Number(account.quota.limit || 15);
  const remaining = Math.max(0, Number(account.quota.remaining ?? limit - used));
  const reset = account.quota.periodEnd ? " Resets " + new Date(account.quota.periodEnd).toLocaleDateString() + "." : "";
  accountQuota.textContent = used + " / " + limit + " exports used this month. " + remaining + " remaining." + reset;
  quotaMeter.style.width = Math.min(100, Math.max(0, (used / limit) * 100)) + "%";
}

function exportLockMessage(account) {
  if (!canExportCurrentContent) {
    return undefined;
  }

  if (!account?.signedIn) {
    return "Start a free account to export Word/PDF files.";
  }

  if (account.status === "revoked") {
    return "This account has been revoked.";
  }

  if (account.status !== "active") {
    return "Your paid plan is no longer active. Manage billing or start a free account.";
  }

  if (account.quota?.limit !== null && account.quota?.remaining !== undefined && account.quota.remaining <= 0) {
    return account.quota.periodEnd
      ? "Free export limit reached. Your 15 exports reset on " + new Date(account.quota.periodEnd).toLocaleDateString() + "."
      : "Free export limit reached. Upgrade for unlimited exports.";
  }

  return undefined;
}

function updateExportButtons(account) {
  const blocked = exportLockMessage(account);
  [downloadButton, pdfButton].forEach((button) => {
    if (!button || !canExportCurrentContent) {
      return;
    }
    button.disabled = false;
    button.classList.toggle("export-locked", Boolean(blocked));
    button.setAttribute("aria-disabled", blocked ? "true" : "false");
  });

  if (downloadStatus && blocked) {
    downloadStatus.textContent = blocked;
  }
}

function startCheckoutPolling() {
  if (checkoutPollTimer) {
    clearInterval(checkoutPollTimer);
  }

  let attempts = 0;
  checkoutPollTimer = window.setInterval(async () => {
    attempts += 1;
    await loadAccountState();

    if (
      currentAccount?.signedIn &&
      currentAccount.status === "active" &&
      (currentAccount.plan === "plus_subscription" || currentAccount.plan === "lifetime")
    ) {
      clearInterval(checkoutPollTimer);
      checkoutPollTimer = 0;
      if (accountStatus) {
        accountStatus.className = "account-status ok";
        accountStatus.textContent = "Payment confirmed. Unlimited exports are active.";
      }
      return;
    }

    if (attempts >= 40) {
      clearInterval(checkoutPollTimer);
      checkoutPollTimer = 0;
      if (accountStatus) {
        accountStatus.className = "account-status";
        accountStatus.textContent = "Still waiting for Stripe to confirm. Click Refresh account in a moment.";
      }
    }
  }, 3000);
}

function renderQuotaPill(account) {
  if (!quotaPill) {
    return;
  }

  quotaPill.className = "quota-pill";
  if (!account.signedIn || !account.quota) {
    quotaPill.className = "quota-pill blocked";
    quotaPill.textContent = "Activate to export";
    return;
  }

  if (account.quota.limit === null) {
    quotaPill.className = "quota-pill unlimited";
    quotaPill.textContent = "Unlimited exports";
    return;
  }

  const limit = Number(account.quota.limit || 15);
  const remaining = Math.max(0, Number(account.quota.remaining ?? limit - Number(account.quota.used || 0)));
  quotaPill.className = remaining > 0 ? "quota-pill free" : "quota-pill blocked";
  quotaPill.textContent = remaining + " free exports left";
}
</script>
</body>
</html>`;
}

function emptyPreviewHtml(text: string): string {
  return `
<!doctype html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; color: #475569; padding: 18px;">
${text ? "No rich HTML is currently available on the clipboard." : "Clipboard is empty."}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
