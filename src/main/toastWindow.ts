import { BrowserWindow, screen } from "electron";

export class ToastController {
  private window: BrowserWindow | undefined;
  private hideTimer: NodeJS.Timeout | undefined;

  show(message: string, variant: "success" | "error" | "info" = "success"): void {
    this.close();

    const display = screen.getPrimaryDisplay();
    const width = 380;
    const height = 82;
    const x = Math.round(display.workArea.x + display.workArea.width - width - 20);
    const y = Math.round(display.workArea.y + display.workArea.height - height - 24);

    this.window = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.window.loadURL(makeToastUrl(message, variant));
    this.window.once("ready-to-show", () => this.window?.showInactive());
    this.window.on("closed", () => {
      this.window = undefined;
    });

    this.hideTimer = setTimeout(() => this.close(), 1800);
  }

  close(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }

    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
  }
}

function makeToastUrl(message: string, variant: string): string {
  const accent = variant === "error" ? "#dc2626" : variant === "info" ? "#2563eb" : "#059669";
  const background = variant === "error" ? "#fef2f2" : variant === "info" ? "#eff6ff" : "#ecfdf5";
  const title = variant === "error" ? "Action needed" : variant === "info" ? "GPT Mathematical" : "Ready";
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: "Segoe UI", Arial, sans-serif;
  background: transparent;
}
.toast {
  box-sizing: border-box;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  margin: 4px;
  padding: 14px 15px;
  border-radius: 8px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.55);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  align-items: center;
}
.badge {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid ${accent};
  background: ${background};
  display: grid;
  place-items: center;
}
.badge::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${accent};
}
.title {
  font-size: 13px;
  font-weight: 750;
  line-height: 1.2;
}
.message {
  margin-top: 4px;
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
</head>
<body>
<div class="toast">
  <div class="badge"></div>
  <div>
    <div class="title">${title}</div>
    <div class="message">${escapeForHtml(message)}</div>
  </div>
</div>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
