import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { defaultSettings, type AppSettings } from "../shared/types";

export class SettingsStore {
  private readonly filePath: string;
  private settings: AppSettings;

  constructor(filePath = path.join(app.getPath("userData"), "settings.json")) {
    this.filePath = filePath;
    this.settings = this.load();
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  set(partial: Partial<AppSettings>): AppSettings {
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    this.save();
    return this.get();
  }

  toggleEnabled(): AppSettings {
    return this.set({ enabled: !this.settings.enabled });
  }

  private load(): AppSettings {
    try {
      if (!fs.existsSync(this.filePath)) {
        return defaultSettings;
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<AppSettings>;
      return normalizeSettings({ ...defaultSettings, ...parsed });
    } catch {
      return defaultSettings;
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), "utf8");
  }
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    enabled: Boolean(settings.enabled),
    showToasts: Boolean(settings.showToasts),
    showPreviewOnConvert: Boolean(settings.showPreviewOnConvert),
    maxClipboardChars: clampNumber(settings.maxClipboardChars, 1_000, 1_000_000, defaultSettings.maxClipboardChars),
    convertDiagrams: Boolean(settings.convertDiagrams)
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}
