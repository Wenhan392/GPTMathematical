import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

let shareImportWindow: BrowserWindow | undefined;

export interface ShareImportWindowResult {
  message: string;
  responseOptions: Array<{ id: string; label: string }>;
  selectedResponseId: string;
}

export function registerShareImportIpc(handler: (url: string, responseId?: string) => Promise<ShareImportWindowResult>): void {
  ipcMain.handle("share-import:import", async (_event, url: string, responseId?: string) => {
    try {
      const result = await handler(url, responseId);
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not import the shared conversation."
      };
    }
  });
}

export function openShareImportWindow(): void {
  if (shareImportWindow && !shareImportWindow.isDestroyed()) {
    shareImportWindow.focus();
    return;
  }

  shareImportWindow = new BrowserWindow({
    width: 620,
    height: 390,
    title: "Import ChatGPT Share Link",
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "shareImportPreload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  shareImportWindow.loadURL(makeImportUrl());
  shareImportWindow.on("closed", () => {
    shareImportWindow = undefined;
  });
}

function makeImportUrl(): string {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Import ChatGPT Share Link</title>
<style>
body {
  margin: 0;
  color: #111827;
  background: #eef2f7;
  font-family: "Segoe UI", Arial, sans-serif;
}
main {
  min-height: 100vh;
  padding: 22px;
  box-sizing: border-box;
}
.surface {
  padding: 18px;
  border: 1px solid #d5dce8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
h1 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  font-weight: 730;
  letter-spacing: 0;
}
.tag {
  padding: 4px 8px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.form-row {
  margin-top: 14px;
}
.hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}
label {
  display: block;
  margin-bottom: 7px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 11px;
  border: 1px solid #b7c2d4;
  border-radius: 6px;
  color: #111827;
  background: #ffffff;
  font-size: 13px;
}
input:focus,
select:focus {
  outline: 3px solid #bfdbfe;
  border-color: #2563eb;
}
.response-picker {
  display: none;
}
.response-picker.visible {
  display: block;
}
button {
  margin-top: 16px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: 6px;
  color: white;
  background: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.14);
  font-weight: 700;
  cursor: default;
}
button:hover {
  background: #1d4ed8;
}
button:disabled {
  background: #94a3b8;
  box-shadow: none;
}
.status {
  min-height: 36px;
  margin-top: 14px;
  padding: 9px 11px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  line-height: 1.4;
}
.error {
  border-color: #fca5a5;
  color: #7f1d1d;
  background: #fef2f2;
}
.ok {
  border-color: #86efac;
  color: #14532d;
  background: #f0fdf4;
}
</style>
</head>
<body>
<main>
  <div class="surface">
    <div class="header">
      <h1>Import ChatGPT Share</h1>
      <div class="tag">Local export</div>
    </div>
    <div class="form-row">
      <label for="url">Share URL</label>
      <input id="url" type="url" placeholder="https://chatgpt.com/share/..." autofocus>
      <div class="hint">Imports clean Markdown and equations from the shared conversation.</div>
    </div>
    <div id="response-picker" class="response-picker form-row">
      <label for="response">Export content</label>
      <select id="response"></select>
    </div>
    <button id="import">Import and copy formatted content</button>
    <div id="status" class="status">Ready.</div>
  </div>
</main>
<script>
const input = document.getElementById("url");
const button = document.getElementById("import");
const status = document.getElementById("status");
const responsePicker = document.getElementById("response-picker");
const response = document.getElementById("response");
let lastImportedUrl = "";

button.addEventListener("click", async () => {
  const url = input.value.trim();
  if (!url) {
    status.className = "status error";
    status.textContent = "Paste a ChatGPT shared conversation URL first.";
    return;
  }

  button.disabled = true;
  status.className = "status";
  status.textContent = "Importing shared conversation...";

  const result = await runSettledImport(url, response.value || undefined);
  status.className = result.ok ? "status ok" : "status error";
  status.textContent = result.message;
  button.disabled = false;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    button.click();
  }
});

response.addEventListener("change", () => {
  if (lastImportedUrl && !button.disabled) {
    button.click();
  }
});

async function runSettledImport(url, selectedId) {
  const first = await window.gptMathShareImport.importUrl(url, selectedId);
  if (!first.ok) {
    return first;
  }

  lastImportedUrl = url;
  updateResponseOptions(first.responseOptions || [], first.selectedResponseId || "all");

  status.className = "status";
  status.textContent = "Finalizing formatted preview...";
  await new Promise((resolve) => setTimeout(resolve, 220));

  const second = await window.gptMathShareImport.importUrl(url, response.value || first.selectedResponseId || selectedId);
  if (!second.ok) {
    return first;
  }

  lastImportedUrl = url;
  updateResponseOptions(second.responseOptions || [], second.selectedResponseId || "all");
  return second;
}

function updateResponseOptions(options, selectedId) {
  if (!options || options.length <= 1) {
    responsePicker.className = "response-picker";
    response.innerHTML = "";
    return;
  }

  const previous = response.value || selectedId;
  response.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = option.label;
    response.appendChild(item);
  });
  response.value = options.some((option) => option.id === selectedId)
    ? selectedId
    : options.some((option) => option.id === previous)
    ? previous
    : "all";
  responsePicker.className = "response-picker visible";
  button.textContent = response.value === "all"
    ? "Import whole chat"
    : "Import selected response";
}
</script>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
