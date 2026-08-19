import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import type { AppSettings } from "../shared/types";
import type { SettingsStore } from "./settings";

let settingsWindow: BrowserWindow | undefined;

export function registerSettingsIpc(settingsStore: SettingsStore, onChanged: () => void): void {
  ipcMain.handle("settings:load", () => settingsStore.get());
  ipcMain.handle("settings:save", (_event, partial: Partial<AppSettings>) => {
    const settings = settingsStore.set(partial);
    onChanged();
    return settings;
  });
}

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 420,
    title: "GPT Mathematical Settings",
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "settingsPreload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadURL(makeSettingsUrl());
  settingsWindow.on("closed", () => {
    settingsWindow = undefined;
  });
}

function makeSettingsUrl(): string {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>GPT Mathematical Settings</title>
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
  margin: 0 0 18px;
  font-size: 20px;
  letter-spacing: 0;
}
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 14px 0;
  border-top: 1px solid #d9dee7;
}
.label {
  font-size: 14px;
  font-weight: 650;
}
.hint {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}
input[type="number"] {
  width: 128px;
  padding: 8px;
  border: 1px solid #aeb8c8;
  border-radius: 6px;
  font-size: 13px;
}
button {
  margin-top: 18px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  color: white;
  background: #2563eb;
  font-weight: 700;
}
</style>
</head>
<body>
<main>
  <h1>GPT Mathematical</h1>
  <div class="row">
    <div>
      <div class="label">Auto-fix clipboard</div>
      <div class="hint">Convert detected math and STEM content after copying.</div>
    </div>
    <input id="enabled" type="checkbox">
  </div>
  <div class="row">
    <div>
      <div class="label">Show toasts</div>
      <div class="hint">Briefly confirm when formatted content is ready.</div>
    </div>
    <input id="showToasts" type="checkbox">
  </div>
  <div class="row">
    <div>
      <div class="label">Show preview on clipboard changes</div>
      <div class="hint">Open or update a visual debug preview whenever copied text changes.</div>
    </div>
    <input id="showPreviewOnConvert" type="checkbox">
  </div>
  <div class="row">
    <div>
      <div class="label">Convert diagrams</div>
      <div class="hint">Preserve Mermaid blocks as formatted diagram cards.</div>
    </div>
    <input id="convertDiagrams" type="checkbox">
  </div>
  <div class="row">
    <div>
      <div class="label">Maximum clipboard characters</div>
      <div class="hint">Large copies are skipped to keep the app responsive.</div>
    </div>
    <input id="maxClipboardChars" type="number" min="1000" max="1000000" step="1000">
  </div>
  <button id="save">Save</button>
</main>
<script>
const fields = {
  enabled: document.getElementById("enabled"),
  showToasts: document.getElementById("showToasts"),
  showPreviewOnConvert: document.getElementById("showPreviewOnConvert"),
  convertDiagrams: document.getElementById("convertDiagrams"),
  maxClipboardChars: document.getElementById("maxClipboardChars")
};

window.gptMathSettings.load().then((settings) => {
  fields.enabled.checked = settings.enabled;
  fields.showToasts.checked = settings.showToasts;
  fields.showPreviewOnConvert.checked = settings.showPreviewOnConvert;
  fields.convertDiagrams.checked = settings.convertDiagrams;
  fields.maxClipboardChars.value = String(settings.maxClipboardChars);
});

document.getElementById("save").addEventListener("click", async () => {
  const settings = await window.gptMathSettings.save({
    enabled: fields.enabled.checked,
    showToasts: fields.showToasts.checked,
    showPreviewOnConvert: fields.showPreviewOnConvert.checked,
    convertDiagrams: fields.convertDiagrams.checked,
    maxClipboardChars: Number(fields.maxClipboardChars.value)
  });
  fields.enabled.checked = settings.enabled;
  fields.showToasts.checked = settings.showToasts;
  fields.showPreviewOnConvert.checked = settings.showPreviewOnConvert;
  fields.convertDiagrams.checked = settings.convertDiagrams;
  fields.maxClipboardChars.value = String(settings.maxClipboardChars);
});
</script>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
