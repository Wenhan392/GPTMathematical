import { app, Menu, nativeImage, Tray } from "electron";
import type { SettingsStore } from "./settings";

export interface TrayActions {
  convertCurrentClipboard: () => void;
  previewClipboard: () => void;
  importShareLink: () => void;
  openSettings: () => void;
}

export class AppTray {
  private tray: Tray;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly actions: TrayActions
  ) {
    this.tray = new Tray(createTrayImage());
    this.tray.setToolTip("GPT Mathematical");
    this.refresh();
  }

  refresh(): void {
    const settings = this.settingsStore.get();
    const menu = Menu.buildFromTemplate([
      {
        label: settings.enabled ? "Auto-fix: On" : "Auto-fix: Off",
        type: "checkbox",
        checked: settings.enabled,
        click: () => {
          this.settingsStore.toggleEnabled();
          this.refresh();
        }
      },
      {
        label: "Convert current clipboard",
        click: this.actions.convertCurrentClipboard
      },
      {
        label: "Preview clipboard",
        click: this.actions.previewClipboard
      },
      {
        label: "Import ChatGPT share link",
        click: this.actions.importShareLink
      },
      { type: "separator" },
      {
        label: "Settings",
        click: this.actions.openSettings
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ]);

    this.tray.setContextMenu(menu);
  }
}

function createTrayImage() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0f172a"/>
  <path d="M8 10h16M8 16h16M8 22h9" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M20.5 20.2l3 3 3.5-6.4" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}
