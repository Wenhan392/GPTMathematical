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
    width: 580,
    height: 620,
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
  background: #f2f5f9;
  font-family: "Segoe UI", Arial, sans-serif;
}
main {
  min-height: 100vh;
  padding: 24px;
  box-sizing: border-box;
}
.surface {
  padding: 20px;
  border: 1px solid #d8e0eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.07);
}
.header {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e3e9f1;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 760;
}
.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: #172033;
  position: relative;
}
.brand-mark::before,
.brand-mark::after {
  content: "";
  position: absolute;
  left: 7px;
  right: 7px;
  height: 2px;
  border-radius: 999px;
  background: #ffffff;
}
.brand-mark::before {
  top: 9px;
}
.brand-mark::after {
  top: 16px;
  right: 12px;
}
h1 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  font-weight: 760;
  letter-spacing: 0;
}
.subtitle {
  margin-top: 6px;
  color: #4b5d72;
  font-size: 13px;
  line-height: 1.45;
}
.settings-group {
  border: 1px solid #e3e9f1;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: center;
  min-height: 52px;
  padding: 14px 15px;
  border-top: 1px solid #e2e8f0;
}
.row:first-child {
  border-top: 0;
}
.label {
  color: #172033;
  font-size: 14px;
  font-weight: 700;
}
.hint {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}
input[type="number"] {
  width: 136px;
  padding: 9px 10px;
  border: 1px solid #c5cfdd;
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
  width: 44px;
  height: 24px;
  border: 1px solid #c5cfdd;
  border-radius: 999px;
  background: #dbe3ee;
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
  transform: translateX(20px);
}
input[type="checkbox"]:focus {
  outline: 3px solid #bfdbfe;
}
.footer {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}
.save-state {
  min-height: 16px;
  color: #64748b;
  font-size: 12px;
}
.save-state.ok {
  color: #166534;
}
button {
  min-width: 132px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  color: white;
  background: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.14);
  font-weight: 760;
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
      <div class="brand"><span class="brand-mark"></span><span>GPT Mathematical</span></div>
      <h1>Settings</h1>
      <div class="subtitle">Clipboard, preview, and export preferences.</div>
    </div>
    <div class="settings-group">
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
    </div>
    <div class="footer">
      <div id="save-state" class="save-state">Changes are saved locally on this computer.</div>
      <button id="save">Save settings</button>
    </div>
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
const saveState = document.getElementById("save-state");

window.gptMathSettings.load().then((settings) => {
  fields.enabled.checked = settings.enabled;
  fields.showToasts.checked = settings.showToasts;
  fields.showPreviewOnConvert.checked = settings.showPreviewOnConvert;
  fields.convertDiagrams.checked = settings.convertDiagrams;
  fields.maxClipboardChars.value = String(settings.maxClipboardChars);
});

document.getElementById("save").addEventListener("click", async () => {
  saveState.className = "save-state";
  saveState.textContent = "Saving...";
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
  saveState.className = "save-state ok";
  saveState.textContent = "Settings saved.";
});
</script>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
