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
