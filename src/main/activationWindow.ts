import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import type { LicenseStore } from "./licenseStore";

let activationWindow: BrowserWindow | undefined;
let handlersRegistered = false;

export function showActivationWindow(licenseStore: LicenseStore): Promise<void> {
  return new Promise((resolve) => {
    let activated = false;
    if (!handlersRegistered) {
      ipcMain.handle("activation:activate", async (_event, email: string, licenseKey: string) => {
        const result = await licenseStore.activate(email, licenseKey);
        if (result.ok) {
          activated = true;
          resolve();
          activationWindow?.close();
        }
        return { ok: result.ok, message: result.message };
      });
      handlersRegistered = true;
    }

    activationWindow = new BrowserWindow({
      width: 520,
      height: 520,
      minWidth: 460,
      minHeight: 460,
      title: "Activate GPT Mathematical",
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, "activationPreload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    activationWindow.loadURL(makeActivationUrl());
    activationWindow.on("closed", () => {
      activationWindow = undefined;
      if (!activated) {
        app.quit();
      }
    });
  });
}

function makeActivationUrl(): string {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Activate GPT Mathematical</title>
<style>
html,
body {
  margin: 0;
  min-height: 100%;
  color: #172033;
  background: #eef3f9;
  font-family: "Segoe UI", Arial, sans-serif;
}
body {
  display: grid;
  place-items: center;
  padding: 22px;
}
.card {
  width: min(430px, 100%);
  padding: 24px;
  border: 1px solid #d8e0eb;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.14);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}
.mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #172033;
  position: relative;
}
.mark::before,
.mark::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: #ffffff;
}
.mark::before {
  top: 10px;
}
.mark::after {
  top: 17px;
  right: 13px;
}
h1 {
  margin: 18px 0 8px;
  color: #0f172a;
  font-size: 28px;
  line-height: 1.08;
}
p {
  margin: 0 0 18px;
  color: #4b5d72;
  font-size: 14px;
  line-height: 1.5;
}
label {
  display: block;
  margin: 13px 0 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 760;
  text-transform: uppercase;
}
input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 8px 10px;
  border: 1px solid #c5cfdd;
  border-radius: 7px;
  color: #111827;
  background: #ffffff;
  font: 13px/1.2 "Segoe UI", Arial, sans-serif;
}
button {
  width: 100%;
  height: 42px;
  margin-top: 16px;
  border: 1px solid #1d4ed8;
  border-radius: 7px;
  color: #ffffff;
  background: #2563eb;
  font: 760 13px/1 "Segoe UI", Arial, sans-serif;
}
button:disabled {
  border-color: #94a3b8;
  background: #94a3b8;
}
#status {
  min-height: 20px;
  margin-top: 13px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.4;
}
#status.error {
  color: #991b1b;
}
#status.ok {
  color: #166534;
}
</style>
</head>
<body>
<main class="card">
  <div class="brand"><span class="mark"></span><span>GPT Mathematical</span></div>
  <h1>Activate your license</h1>
  <p>Sign in to your account portal after purchase, copy your license key, then paste it here to unlock the Windows app.</p>
  <label for="email">Account email</label>
  <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
  <label for="license">License key</label>
  <input id="license" type="text" autocomplete="off" placeholder="GPTM-XXXXX-XXXXX-XXXXX-XXXXX">
  <button id="activate" type="button">Activate</button>
  <div id="status">A short offline grace period is available after successful activation.</div>
</main>
<script>
const email = document.getElementById("email");
const license = document.getElementById("license");
const button = document.getElementById("activate");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.className = "";
  status.textContent = "Activating...";
  const result = await window.gptMathActivation.activate(email.value, license.value);
  status.className = result.ok ? "ok" : "error";
  status.textContent = result.message;
  button.disabled = false;
});
</script>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
