export type DetectedFeature =
  | "latex"
  | "markdown-table"
  | "markdown-list"
  | "markdown-heading"
  | "code-block"
  | "mermaid"
  | "chemistry"
  | "physics"
  | "math-text";

export interface ClipboardSnapshot {
  rawText: string;
  rawHtml: string;
  hash: string;
  timestamp: number;
  source: "external" | "app";
}

export interface DetectionResult {
  shouldConvert: boolean;
  features: DetectedFeature[];
  confidence: "none" | "low" | "medium" | "high";
  reason: string;
}

export interface ConversionResult {
  html: string;
  plainText: string;
  warnings: string[];
}

export interface AppSettings {
  enabled: boolean;
  showToasts: boolean;
  showPreviewOnConvert: boolean;
  maxClipboardChars: number;
  convertDiagrams: boolean;
}

export const defaultSettings: AppSettings = {
  enabled: true,
  showToasts: true,
  showPreviewOnConvert: true,
  maxClipboardChars: 120_000,
  convertDiagrams: true
};
