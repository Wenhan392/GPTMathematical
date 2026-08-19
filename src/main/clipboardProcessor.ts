import { clipboard } from "electron";
import { convertToRichHtml } from "../conversion/convert";
import { detectConvertibleContent } from "../conversion/detect";
import { normalizeClipboardHtml } from "../conversion/html";
import { hashText } from "../shared/hash";
import type { AppSettings, ClipboardSnapshot } from "../shared/types";

export interface ClipboardPort {
  readText(): string;
  readHTML(): string;
  write(data: { text: string; html: string }): void;
}

export interface ClipboardProcessorDeps {
  clipboardPort: ClipboardPort;
  getSettings: () => AppSettings;
  notify: (message: string, variant?: "success" | "error" | "info") => void;
  preview?: (content: ClipboardPreviewContent) => void;
  now?: () => number;
}

export interface ProcessResult {
  converted: boolean;
  reason: string;
  snapshot?: ClipboardSnapshot;
}

export interface ClipboardPreviewContent {
  title: string;
  status: string;
  html: string;
  plainText: string;
  warnings: string[];
}

export class ClipboardProcessor {
  private lastSeenHash = "";
  private lastWrittenHash = "";
  private inFlight = false;

  constructor(private readonly deps: ClipboardProcessorDeps) {}

  async poll(): Promise<ProcessResult> {
    const text = this.deps.clipboardPort.readText();
    const html = this.deps.clipboardPort.readHTML();
    const hash = hashClipboardPayload(text, html);

    if (hash === this.lastSeenHash) {
      return { converted: false, reason: "Clipboard has not changed." };
    }

    this.lastSeenHash = hash;
    return this.processSnapshot(text, html, false);
  }

  async convertCurrentClipboard(): Promise<ProcessResult> {
    return this.processSnapshot(this.deps.clipboardPort.readText(), this.deps.clipboardPort.readHTML(), true);
  }

  markClipboardAsAppWritten(text: string, html: string): void {
    const hash = hashClipboardPayload(text, html);
    this.lastWrittenHash = hash;
    this.lastSeenHash = hash;
  }

  private async processSnapshot(text: string, html: string, manual: boolean): Promise<ProcessResult> {
    if (this.inFlight) {
      return { converted: false, reason: "Conversion already running." };
    }

    const hash = hashClipboardPayload(text, html);
    const snapshot: ClipboardSnapshot = {
      rawText: text,
      rawHtml: html,
      hash,
      timestamp: this.deps.now?.() ?? Date.now(),
      source: hash === this.lastWrittenHash ? "app" : "external"
    };

    if (!manual && snapshot.source === "app") {
      return { converted: false, reason: "Ignoring app-generated clipboard content.", snapshot };
    }

    const settings = this.deps.getSettings();
    const hasHtml = html.trim().length > 0;
    if (!manual && !settings.enabled) {
      this.previewClipboardPayload(text, html, "Auto-fix is disabled; showing copied content for debugging.", settings);
      return { converted: false, reason: "Auto-fix is disabled.", snapshot };
    }

    if (!text.trim() && !hasHtml) {
      this.previewClipboardPayload(text, html, "Clipboard has no plain text or rich HTML to convert.", settings);
      return { converted: false, reason: "Clipboard is empty.", snapshot };
    }

    if (Math.max(text.length, html.length) > settings.maxClipboardChars) {
      this.deps.notify(`Clipboard content is over ${settings.maxClipboardChars.toLocaleString()} characters.`, "error");
      this.previewClipboardPayload(text, html, "Clipboard content is too large to auto-convert; showing debug preview only.", settings, [
        `Over ${settings.maxClipboardChars.toLocaleString()} character limit.`
      ]);
      return { converted: false, reason: "Clipboard content exceeds max size.", snapshot };
    }

    const detection = detectConvertibleContent(text);
    if (hasHtml && (!manual || hasMathOrDocumentHtml(html) || detection.shouldConvert)) {
      const normalizedHtml = normalizeClipboardHtml(html);
      this.previewRichHtml(
        normalizedHtml,
        text,
        hasMathOrDocumentHtml(html)
          ? "Using the browser's rich HTML clipboard payload; this avoids the broken plain-text formula fallback."
          : "Showing the rich HTML currently available on the clipboard.",
        [],
        settings
      );

      if (hasMathOrDocumentHtml(html) || detection.shouldConvert) {
        this.deps.clipboardPort.write({
          text,
          html: normalizedHtml
        });
        this.lastWrittenHash = hashClipboardPayload(text, normalizedHtml);
        this.lastSeenHash = this.lastWrittenHash;
        this.deps.notify("Rich browser clipboard preserved.", "success");
        return { converted: true, reason: "Used browser rich HTML clipboard payload.", snapshot };
      }

      return { converted: false, reason: "Rich HTML preview shown.", snapshot };
    }

    if (!manual && !detection.shouldConvert) {
      this.previewClipboardPayload(text, html, detection.reason, settings);
      return { converted: false, reason: detection.reason, snapshot };
    }

    try {
      this.inFlight = true;
      const conversion = convertToRichHtml(text, settings);
      this.deps.clipboardPort.write({
        text: conversion.plainText,
        html: conversion.html
      });
      this.lastWrittenHash = hashClipboardPayload(conversion.plainText, conversion.html);
      this.lastSeenHash = this.lastWrittenHash;

      const warningSuffix = conversion.warnings.length > 0 ? ` (${conversion.warnings.length} warning${conversion.warnings.length === 1 ? "" : "s"})` : "";
      this.deps.notify(`Formatted clipboard is ready${warningSuffix}.`, conversion.warnings.length > 0 ? "info" : "success");
      this.previewRichHtml(conversion.html, conversion.plainText, "The formatted preview below is now on your clipboard.", conversion.warnings, settings);

      return { converted: true, reason: detection.reason, snapshot };
    } catch (error) {
      this.deps.notify("Could not convert clipboard content.", "error");
      return {
        converted: false,
        reason: error instanceof Error ? error.message : "Unknown conversion error.",
        snapshot
      };
    } finally {
      this.inFlight = false;
    }
  }

  private previewPlainText(text: string, status: string, settings: AppSettings, warnings: string[] = []): void {
    this.previewClipboardPayload(text, "", status, settings, warnings);
  }

  private previewClipboardPayload(text: string, html: string, status: string, settings: AppSettings, warnings: string[] = []): void {
    if (!settings.showPreviewOnConvert) {
      return;
    }

    const normalizedHtml = html.trim() ? normalizeClipboardHtml(html) : "";
    const preview = normalizedHtml
      ? { html: normalizedHtml, plainText: text, warnings: [] }
      : text.trim() && text.length <= settings.maxClipboardChars
      ? convertToRichHtml(text, settings)
      : { html: "", plainText: text, warnings: [] };

    this.deps.preview?.({
      title: "Clipboard copied",
      status,
      html: preview.html,
      plainText: text,
      warnings: [...warnings, ...preview.warnings]
    });
  }

  private previewRichHtml(html: string, plainText: string, status: string, warnings: string[], settings: AppSettings): void {
    if (!settings.showPreviewOnConvert) {
      return;
    }

    this.deps.preview?.({
      title: "Clipboard converted",
      status,
      html,
      plainText,
      warnings
    });
  }
}

export const electronClipboardPort: ClipboardPort = {
  readText: () => clipboard.readText(),
  readHTML: () => clipboard.readHTML(),
  write: (data) => clipboard.write(data)
};

function hashClipboardPayload(text: string, html: string): string {
  return hashText(`${text}\u0000${html}`);
}

function hasMathOrDocumentHtml(html: string): boolean {
  return /<(?:math|mrow|msup|mfrac|annotation)\b/i.test(html)
    || /\b(?:katex|mathjax|MathJax|mjx-|ql-formula|arithmatex)\b/i.test(html)
    || /data-(?:latex|math|formula)|aria-label=["'][^"']*(?:math|equation|formula)/i.test(html)
    || /<(?:table|thead|tbody|tr|td|th|ol|ul|pre|code|h[1-6])\b/i.test(html);
}
