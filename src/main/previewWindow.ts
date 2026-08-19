import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

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

export interface PreviewIpcHandlers {
  downloadWord: () => Promise<string>;
  importShare: (url: string, responseId?: string) => Promise<PreviewShareImportResult>;
}

export class ClipboardPreviewController {
  private window: BrowserWindow | undefined;
  private renderVersion = 0;

  show(content: ClipboardPreviewContent): void {
    this.renderVersion += 1;
    const renderVersion = this.renderVersion;

    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        width: 980,
        height: 760,
        minWidth: 720,
        minHeight: 540,
        title: "Clipboard Preview",
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

    const previewUrl = makePreviewUrl(content);
    this.window.loadURL(previewUrl);
    if (content.stabilizeRender) {
      setTimeout(() => {
        if (!this.window || this.window.isDestroyed() || renderVersion !== this.renderVersion) {
          return;
        }

        this.window.loadURL(previewUrl);
      }, 250);
    }
    this.window.once("ready-to-show", () => this.window?.show());
    this.window.focus();
  }
}

export function registerPreviewIpc(handlers: PreviewIpcHandlers): void {
  ipcMain.handle("preview:download-word", async () => {
    try {
      const message = await handlers.downloadWord();
      return { ok: true, message };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save the Word document."
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
}

function makePreviewUrl(content: ClipboardPreviewContent): string {
  const warnings = content.warnings.length
    ? `<div class="warnings">${content.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}</div>`
    : "";
  const actions = '<button id="download-word" type="button">Download Word file</button><span id="download-status"></span>';

  const previewHtml = content.html || emptyPreviewHtml(content.plainText);
  const previewState = scriptJson({
    shareUrl: content.shareUrl ?? "",
    responseOptions: content.responseOptions ?? [],
    selectedResponseId: content.selectedResponseId ?? "all"
  });
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Clipboard Preview</title>
<style>
html,
body {
  margin: 0;
  min-height: 100%;
  color: #111827;
  background: #eef2f7;
  font-family: "Segoe UI", Arial, sans-serif;
}
body {
  display: grid;
  grid-template-rows: auto 1fr;
}
header {
  padding: 16px 20px 13px;
  background: #fbfcfe;
  border-bottom: 1px solid #cfd7e3;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
h1 {
  margin: 0;
  min-width: 0;
  color: #0f172a;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
button {
  padding: 8px 12px;
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  color: #ffffff;
  background: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  font: 700 12px/1 "Segoe UI", Arial, sans-serif;
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
#download-status {
  max-width: 230px;
  color: #475569;
  font-size: 12px;
  line-height: 1.3;
}
.status {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}
.import-panel {
  margin-top: 14px;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px) auto;
  gap: 10px;
  align-items: end;
}
.field {
  min-width: 0;
}
label {
  display: block;
  margin-bottom: 5px;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 8px 10px;
  border: 1px solid #b7c2d4;
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
  height: 34px;
}
#import-status {
  grid-column: 1 / -1;
  min-height: 16px;
  color: #64748b;
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
  padding: 16px 20px 20px;
  display: grid;
  grid-template-rows: minmax(300px, 1fr) minmax(170px, 0.48fr);
  gap: 14px;
  min-height: 0;
}
section {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 12px;
  border: 1px solid #d5dce8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}
.section-title {
  margin-bottom: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
iframe,
pre {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 1px solid #d7dee9;
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
  background: #f8fafc;
  font: 12px/1.45 Consolas, "Cascadia Mono", monospace;
}
.warnings {
  margin-top: 10px;
  padding: 9px 11px;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  color: #7c2d12;
  background: #fffbeb;
  font-size: 12px;
  line-height: 1.4;
}
</style>
</head>
<body>
<header>
  <div class="header-row">
    <h1>${escapeHtml(content.title)}</h1>
    <div class="actions">${actions}</div>
  </div>
  <div class="status">${escapeHtml(content.status)}</div>
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
    <div id="import-status">Import a ChatGPT share link here, or keep using this window as your clipboard preview.</div>
  </div>
  ${warnings}
</header>
<main>
  <section>
    <div class="section-title"><span>Formatted Paste Preview</span><span>what Word/Docs/OneNote should receive</span></div>
    <iframe sandbox srcdoc="${escapeAttribute(previewHtml)}"></iframe>
  </section>
  <section>
    <div class="section-title"><span>Plain Text Fallback</span><span>${content.plainText.length.toLocaleString()} characters</span></div>
    <pre>${escapeHtml(content.plainText || "Clipboard has no plain text.")}</pre>
  </section>
</main>
<script>
const previewState = ${previewState};
const downloadButton = document.getElementById("download-word");
const downloadStatus = document.getElementById("download-status");
const shareUrl = document.getElementById("share-url");
const importButton = document.getElementById("import-share");
const importStatus = document.getElementById("import-status");
const responseField = document.getElementById("response-field");
const responseSelect = document.getElementById("share-response");
let lastImportedUrl = previewState.shareUrl || "";

if (shareUrl) {
  shareUrl.value = previewState.shareUrl || "";
}
updateResponseOptions(previewState.responseOptions || [], previewState.selectedResponseId || "all");

if (downloadButton && downloadStatus) {
  downloadButton.addEventListener("click", async () => {
    downloadButton.disabled = true;
    downloadStatus.textContent = "Saving...";
    const result = await window.gptMathPreview.downloadWord();
    downloadStatus.textContent = result.message;
    downloadButton.disabled = false;
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
</script>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
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
