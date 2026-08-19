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
    width: 560,
    height: 330,
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
  color: #172033;
  background: #f7f8fa;
  font-family: "Segoe UI", Arial, sans-serif;
}
main {
  padding: 22px;
}
h1 {
  margin: 0 0 10px;
  font-size: 20px;
  letter-spacing: 0;
}
p {
  margin: 0 0 16px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}
label {
  display: block;
  margin-bottom: 7px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 11px;
  border: 1px solid #aeb8c8;
  border-radius: 6px;
  font-size: 13px;
}
select {
  box-sizing: border-box;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #aeb8c8;
  border-radius: 6px;
  color: #172033;
  background: #ffffff;
  font-size: 13px;
}
.response-picker {
  display: none;
  margin-top: 14px;
}
.response-picker.visible {
  display: block;
}
button {
  margin-top: 14px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  color: white;
  background: #2563eb;
  font-weight: 700;
}
button:disabled {
  background: #94a3b8;
}
.status {
  min-height: 38px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  color: #475569;
  background: #ffffff;
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
  <h1>Import ChatGPT Share Link</h1>
  <p>Create a public shared conversation link in ChatGPT, paste it here, and the app will import the conversation into the preview and clipboard.</p>
  <label for="url">Share URL</label>
  <input id="url" type="url" placeholder="https://chatgpt.com/share/..." autofocus>
  <div id="response-picker" class="response-picker">
    <label for="response">Export content</label>
    <select id="response"></select>
  </div>
  <button id="import">Import and copy formatted content</button>
  <div id="status" class="status">Ready.</div>
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
