import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

export interface ClipboardPreviewContent {
  title: string;
  status: string;
  html: string;
  plainText: string;
  warnings: string[];
  canDownloadWord?: boolean;
}

export class ClipboardPreviewController {
  private window: BrowserWindow | undefined;

  show(content: ClipboardPreviewContent): void {
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        width: 780,
        height: 720,
        minWidth: 560,
        minHeight: 460,
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

    this.window.loadURL(makePreviewUrl(content));
    this.window.once("ready-to-show", () => this.window?.show());
    this.window.focus();
  }
}

export function registerPreviewIpc(downloadWord: () => Promise<string>): void {
  ipcMain.handle("preview:download-word", async () => {
    try {
      const message = await downloadWord();
      return { ok: true, message };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save the Word document."
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
  color: #172033;
  background: #f6f7f9;
  font-family: "Segoe UI", Arial, sans-serif;
}
body {
  display: grid;
  grid-template-rows: auto 1fr;
}
header {
  padding: 18px 22px 14px;
  background: #ffffff;
  border-bottom: 1px solid #d9dee7;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
button {
  padding: 7px 11px;
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  color: #ffffff;
  background: #2563eb;
  font: 700 12px/1 "Segoe UI", Arial, sans-serif;
}
button:disabled {
  border-color: #94a3b8;
  background: #94a3b8;
}
#download-status {
  max-width: 230px;
  color: #475569;
  font-size: 12px;
  line-height: 1.3;
}
.status {
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
}
main {
  padding: 18px 22px 22px;
  display: grid;
  grid-template-rows: minmax(260px, 1fr) minmax(160px, 0.55fr);
  gap: 16px;
  min-height: 0;
}
section {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
}
.section-title {
  margin-bottom: 8px;
  display: flex;
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
  border: 1px solid #cbd5e1;
  border-radius: 8px;
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
  color: #0f172a;
  font: 12px/1.45 Consolas, "Cascadia Mono", monospace;
}
.warnings {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  color: #7c2d12;
  background: #fffbeb;
  font-size: 12px;
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
const button = document.getElementById("download-word");
const status = document.getElementById("download-status");
if (button && status) {
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Saving...";
    const result = await window.gptMathPreview.downloadWord();
    status.textContent = result.message;
    button.disabled = false;
  });
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
