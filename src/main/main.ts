import { app, clipboard, dialog } from "electron";
import { ClipboardProcessor, electronClipboardPort } from "./clipboardProcessor";
import { convertToRichHtml } from "../conversion/convert";
import { detectConvertibleContent } from "../conversion/detect";
import { suggestDocxFilename, writeWordDocument, type WordExportContent } from "./docxExporter";
import { suggestPdfFilename, writePdfDocument } from "./pdfExporter";
import { importSharedConversation } from "./shareImporter";
import { ClipboardPreviewController, registerPreviewIpc, type ClipboardPreviewContent } from "./previewWindow";
import { SettingsStore } from "./settings";
import { openSettingsWindow, registerSettingsIpc } from "./settingsWindow";
import { ToastController } from "./toastWindow";
import { AppTray } from "./tray";
import { LicenseStore } from "./licenseStore";
import { showActivationWindow } from "./activationWindow";

let tray: AppTray | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let latestWordExport: WordExportContent | undefined;
let autoShareImportInFlight = false;
let lastAutoShareImportText = "";

app.setName("GPT Mathematical");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  openSettingsWindow();
});

app.whenReady().then(async () => {
  const licenseStore = new LicenseStore();
  const licenseStatus = await licenseStore.validateCachedLicense();
  if (!licenseStatus.usable) {
    await showActivationWindow(licenseStore);
  }

  const settingsStore = new SettingsStore();
  const toast = new ToastController();
  const preview = new ClipboardPreviewController();

  const notify = (message: string, variant: "success" | "error" | "info" = "success") => {
    if (settingsStore.get().showToasts) {
      toast.show(message, variant);
    }
  };

  const processor = new ClipboardProcessor({
    clipboardPort: electronClipboardPort,
    getSettings: () => settingsStore.get(),
    notify,
    preview: (content) => showPreview(preview, content)
  });

  const importShareIntoPreview = async (url: string, responseId?: string) => {
    const imported = await importSharedConversationStable(url, settingsStore.get(), responseId);
    clipboard.write({
      text: imported.conversion.plainText,
      html: imported.conversion.html
    });
    processor.markClipboardAsAppWritten(imported.conversion.plainText, imported.conversion.html);
    showPreview(preview, {
      title: imported.title,
      status: imported.canDownloadWord === false ? oversizedImportStatus() : shareImportStatus(imported.source),
      html: imported.conversion.html,
      plainText: imported.conversion.plainText,
      warnings: imported.conversion.warnings,
      canDownloadWord: imported.canDownloadWord !== false,
      stabilizeRender: true,
      shareUrl: url,
      responseOptions: imported.responseOptions,
      selectedResponseId: imported.selectedResponseId
    });
    notify(
      imported.canDownloadWord === false ? "Imported chat is too large to format all at once." : "Imported shared conversation.",
      imported.canDownloadWord === false ? "error" : "success"
    );
    return {
      message: imported.canDownloadWord === false
        ? oversizedImportResultMessage(imported.selectedResponseId)
        : shareImportResultMessage(imported.source, imported.selectedResponseId),
      responseOptions: imported.responseOptions,
      selectedResponseId: imported.selectedResponseId
    };
  };

  registerSettingsIpc(settingsStore, () => tray?.refresh());
  registerPreviewIpc({
    downloadWord: async () => {
      if (!latestWordExport) {
        throw new Error("Import a ChatGPT shared conversation before downloading a Word file.");
      }

      const result = await dialog.showSaveDialog({
        title: "Save Word Document",
        defaultPath: suggestDocxFilename(latestWordExport.title),
        filters: [{ name: "Word Document", extensions: ["docx"] }]
      });

      if (result.canceled || !result.filePath) {
        return "Save canceled.";
      }

      writeWordDocument(result.filePath, latestWordExport);
      return `Saved Word file: ${result.filePath}`;
    },
    downloadPdf: async () => {
      if (!latestWordExport) {
        throw new Error("Import a ChatGPT shared conversation before downloading a PDF file.");
      }

      const result = await dialog.showSaveDialog({
        title: "Save PDF Document",
        defaultPath: suggestPdfFilename(latestWordExport.title),
        filters: [{ name: "PDF Document", extensions: ["pdf"] }]
      });

      if (result.canceled || !result.filePath) {
        return "Save canceled.";
      }

      await writePdfDocument(result.filePath, latestWordExport);
      return `Saved PDF file: ${result.filePath}`;
    },
    importShare: importShareIntoPreview
  });

  tray = new AppTray(settingsStore, {
    convertCurrentClipboard: () => {
      void processor.convertCurrentClipboard();
    },
    previewClipboard: () => {
      showClipboardPreview(preview, settingsStore);
    },
    importShareLink: () => {
      showImportWorkspace(preview);
    },
    openSettings: openSettingsWindow
  });

  pollTimer = setInterval(() => {
    void pollClipboard(processor, settingsStore, importShareIntoPreview, notify);
  }, 750);

  notify("Running in the tray.", "info");
});

async function importSharedConversationStable(
  url: string,
  settings: ReturnType<SettingsStore["get"]>,
  responseId?: string
): Promise<Awaited<ReturnType<typeof importSharedConversation>>> {
  const first = await importSharedConversation(url, settings, responseId);
  if (first.canDownloadWord === false) {
    return first;
  }

  try {
    await delay(180);
    const second = await importSharedConversation(url, settings, responseId ?? first.selectedResponseId);
    return preferImportedConversation(first, second);
  } catch {
    return first;
  }
}

function preferImportedConversation(
  first: Awaited<ReturnType<typeof importSharedConversation>>,
  second: Awaited<ReturnType<typeof importSharedConversation>>
): Awaited<ReturnType<typeof importSharedConversation>> {
  if (second.source === "share-api" && first.source !== "share-api") {
    return second;
  }

  const firstScore = scoreImportedPlainText(first.conversion.plainText);
  const secondScore = scoreImportedPlainText(second.conversion.plainText);
  return secondScore >= firstScore ? second : first;
}

function scoreImportedPlainText(text: string): number {
  const latexSignals = (text.match(/\\(?:frac|sqrt|sum|boxed|begin|bar|dot|epsilon|Delta)\b|\\\[|\\\(|\$\$/g) ?? []).length;
  const flattenedSignals = (text.match(/\b(?:frac|sqrt|boxed|begincases|endcases|epsilon|qquad)\b|[A-Za-z]\d[A-Za-z]?\d/g) ?? []).length;
  return latexSignals * 100 - flattenedSignals * 250 + Math.min(text.length, 50_000) / 10_000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollClipboard(
  processor: ClipboardProcessor,
  settingsStore: SettingsStore,
  importShareIntoPreview: (url: string, responseId?: string) => Promise<{ message: string }>,
  notify: (message: string, variant?: "success" | "error" | "info") => void
): Promise<void> {
  const settings = settingsStore.get();
  const text = clipboard.readText();
  const shareUrl = extractChatGptShareUrl(text);

  if (!settings.enabled) {
    lastAutoShareImportText = "";
    await processor.poll();
    return;
  }

  if (!shareUrl) {
    lastAutoShareImportText = "";
    await processor.poll();
    return;
  }

  if (autoShareImportInFlight || text === lastAutoShareImportText) {
    return;
  }

  autoShareImportInFlight = true;
  lastAutoShareImportText = text;
  try {
    notify("ChatGPT share link detected. Importing conversation...", "info");
    await importShareIntoPreview(shareUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import the copied ChatGPT share link.";
    notify(message, "error");
  } finally {
    autoShareImportInFlight = false;
  }
}

function extractChatGptShareUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/share\/[^\s<>"')]+/i);
  if (!match) {
    return undefined;
  }

  try {
    const parsed = new URL(match[0].replace(/[.,;:]+$/, ""));
    if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(parsed.hostname)) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function shareImportStatus(source: "share-api" | "embedded-markdown" | "rendered-dom"): string {
  if (source === "share-api") {
    return "Imported clean shared-conversation Markdown and copied formatted content to the clipboard.";
  }

  if (source === "embedded-markdown") {
    return "Imported clean embedded conversation text and copied formatted content to the clipboard.";
  }

  return "Imported rendered shared-page HTML and copied formatted content to the clipboard.";
}

function oversizedImportStatus(): string {
  return "This import is too large to format safely, so the clipboard contains an error message instead. Select a smaller GPT response to import just that answer.";
}

function shareImportResultMessage(source: "share-api" | "embedded-markdown" | "rendered-dom", selectedResponseId = "all"): string {
  const scope = selectedResponseId === "all" ? "content" : "selected response";

  if (source === "share-api") {
    return `Imported clean shared-conversation Markdown for the ${scope}, opened preview, and copied formatted content.`;
  }

  if (source === "embedded-markdown") {
    return "Imported clean conversation text, opened preview, and copied formatted content.";
  }

  return "Imported rendered page HTML, opened preview, and copied formatted content.";
}

function oversizedImportResultMessage(selectedResponseId = "all"): string {
  if (selectedResponseId === "all") {
    return "Whole chat is too large to format safely. Select a specific GPT response and import again.";
  }

  return "Selected response is too large to format safely. Choose a smaller response or raise the clipboard size limit.";
}

function showPreview(preview: ClipboardPreviewController, content: ClipboardPreviewContent): void {
  if (content.canDownloadWord === false) {
    latestWordExport = undefined;
  } else {
    latestWordExport = {
      title: content.title,
      html: content.html,
      plainText: content.plainText
    };
  }
  preview.show({
    ...content,
    canDownloadWord: content.canDownloadWord !== false
  });
}

function showClipboardPreview(preview: ClipboardPreviewController, settingsStore: SettingsStore): void {
  const text = clipboard.readText();
  const html = clipboard.readHTML();
  const settings = settingsStore.get();
  const clipboardChars = Math.max(text.length, html.length);

  if (clipboardChars > settings.maxClipboardChars) {
    const message = [
      "Clipboard content is too large to preview safely.",
      "",
      `Detected size: ${clipboardChars.toLocaleString()} characters.`,
      `Current limit: ${settings.maxClipboardChars.toLocaleString()} characters.`,
      "",
      "For ChatGPT shared conversations, import the link and select a smaller GPT response."
    ].join("\n");
    const conversion = convertToRichHtml(message, settings);
    showPreview(preview, {
      title: "Clipboard preview",
      status: "Clipboard content is too large, so rich preview conversion was skipped.",
      html: conversion.html,
      plainText: conversion.plainText,
      warnings: [`Over ${settings.maxClipboardChars.toLocaleString()} character limit.`],
      canDownloadWord: false
    });
    return;
  }

  const detection = detectConvertibleContent(text);

  if (html) {
    showPreview(preview, {
      title: "Clipboard preview",
      status: "Showing the rich HTML currently available on the clipboard.",
      html,
      plainText: text,
      warnings: []
    });
    return;
  }

  if (detection.shouldConvert && text.length <= settings.maxClipboardChars) {
    const conversion = convertToRichHtml(text, settings);
    showPreview(preview, {
      title: "Clipboard preview",
      status: "This is how the current plain text would look after conversion.",
      html: conversion.html,
      plainText: conversion.plainText,
      warnings: conversion.warnings
    });
    return;
  }

  showPreview(preview, {
    title: "Clipboard preview",
    status: text.length > settings.maxClipboardChars
      ? `Clipboard content is over ${settings.maxClipboardChars.toLocaleString()} characters, so preview conversion was skipped.`
      : detection.reason,
    html: text.trim() && text.length <= settings.maxClipboardChars ? convertToRichHtml(text, settings).html : "",
    plainText: text,
    warnings: text.length > settings.maxClipboardChars
      ? [`Over ${settings.maxClipboardChars.toLocaleString()} character limit.`]
      : []
  });
}

function showImportWorkspace(preview: ClipboardPreviewController): void {
  const text = clipboard.readText();
  const html = clipboard.readHTML();

  showPreview(preview, {
    title: "Clipboard workspace",
    status: "Import a ChatGPT share link here, or preview the current clipboard.",
    html,
    plainText: text,
    warnings: []
  });
}

app.on("window-all-closed", () => {
  // Keep the tray process alive after the settings window is closed.
});

app.on("before-quit", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
