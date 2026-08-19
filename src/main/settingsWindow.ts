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
    width: 520,
    height: 520,
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
  margin-bottom: 10px;
}
h1 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  font-weight: 730;
  letter-spacing: 0;
}
.subtitle {
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: center;
  min-height: 48px;
  padding: 13px 0;
  border-top: 1px solid #e2e8f0;
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
  padding: 8px 9px;
  border: 1px solid #b7c2d4;
  border-radius: 6px;
  color: #111827;
  background: #ffffff;
  font-size: 13px;
}
input[type="number"]:focus {
  outline: 3px solid #bfdbfe;
  border-color: #2563eb;
}
input[type="checkbox"] {
  appearance: none;
  width: 42px;
  height: 24px;
  border: 1px solid #b7c2d4;
  border-radius: 999px;
  background: #e2e8f0;
  position: relative;
}
input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.24);
  transition: transform 120ms ease;
}
input[type="checkbox"]:checked {
  border-color: #2563eb;
  background: #2563eb;
}
input[type="checkbox"]:checked::after {
  transform: translateX(18px);
}
input[type="checkbox"]:focus {
  outline: 3px solid #bfdbfe;
}
button {
  margin-top: 18px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: 6px;
  color: white;
  background: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.14);
  font-weight: 700;
}
button:hover {
  background: #1d4ed8;
}
</style>
</head>
<body>
<main>
  <div class="surface">
    <div class="header">
      <h1>GPT Mathematical</h1>
      <div class="subtitle">Clipboard, preview, and export preferences.</div>
    </div>
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
        <div class="hint">Brief confirmation messages.</div>
      </div>
      <input id="showToasts" type="checkbox">
    </div>
    <div class="row">
      <div>
        <div class="label">Show preview</div>
        <div class="hint">Open the visual preview after clipboard changes.</div>
      </div>
      <input id="showPreviewOnConvert" type="checkbox">
    </div>
    <div class="row">
      <div>
        <div class="label">Convert diagrams</div>
        <div class="hint">Keep Mermaid blocks as diagram cards.</div>
      </div>
      <input id="convertDiagrams" type="checkbox">
    </div>
    <div class="row">
      <div>
        <div class="label">Clipboard size limit</div>
        <div class="hint">Character limit before conversion is skipped.</div>
      </div>
      <input id="maxClipboardChars" type="number" min="1000" max="1000000" step="1000">
    </div>
    <button id="save">Save settings</button>
  </div>
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
