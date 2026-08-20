import { BrowserWindow, screen } from "electron";

export class ToastController {
  private window: BrowserWindow | undefined;
  private hideTimer: NodeJS.Timeout | undefined;

  show(message: string, variant: "success" | "error" | "info" = "success"): void {
    this.close();

    const display = screen.getPrimaryDisplay();
    const width = 410;
    const height = 90;
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
  const border = variant === "error" ? "#fecaca" : variant === "info" ? "#bfdbfe" : "#bbf7d0";
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
  padding: 14px 16px;
  border-radius: 8px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.45);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  align-items: center;
  position: relative;
  overflow: hidden;
}
.toast::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: ${accent};
}
.badge {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid ${border};
  background: ${background};
  display: grid;
  place-items: center;
  position: relative;
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
  font-weight: 780;
  line-height: 1.2;
}
.message {
  margin-top: 4px;
  font-size: 12.5px;
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
    <div class="title">${escapeForHtml(title)}</div>
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
