import { app, clipboard, dialog } from "electron";
import { ClipboardProcessor, electronClipboardPort } from "./clipboardProcessor";
import { convertToRichHtml } from "../conversion/convert";
import { detectConvertibleContent } from "../conversion/detect";
import { suggestDocxFilename, writeWordDocument, type WordExportContent } from "./docxExporter";
import { importSharedConversation } from "./shareImporter";
import { ClipboardPreviewController, registerPreviewIpc, type ClipboardPreviewContent } from "./previewWindow";
import { SettingsStore } from "./settings";
import { openShareImportWindow, registerShareImportIpc } from "./shareImportWindow";
import { openSettingsWindow, registerSettingsIpc } from "./settingsWindow";
import { ToastController } from "./toastWindow";
import { AppTray } from "./tray";

let tray: AppTray | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let latestWordExport: WordExportContent | undefined;

app.setName("GPT Mathematical");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  openSettingsWindow();
});

app.whenReady().then(() => {
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

  registerSettingsIpc(settingsStore, () => tray?.refresh());
  registerPreviewIpc(async () => {
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
  });
  registerShareImportIpc(async (url, responseId) => {
    const imported = await importSharedConversationStable(url, settingsStore.get(), responseId);
    clipboard.write({
      text: imported.conversion.plainText,
      html: imported.conversion.html
    });
    processor.markClipboardAsAppWritten(imported.conversion.plainText, imported.conversion.html);
    showPreview(preview, {
      title: imported.title,
      status: shareImportStatus(imported.source),
      html: imported.conversion.html,
      plainText: imported.conversion.plainText,
      warnings: imported.conversion.warnings,
      canDownloadWord: true,
      stabilizeRender: true
    });
    notify("Imported shared conversation.", "success");
    return {
      message: shareImportResultMessage(imported.source, imported.selectedResponseId),
      responseOptions: imported.responseOptions,
      selectedResponseId: imported.selectedResponseId
    };
  });

  tray = new AppTray(settingsStore, {
    convertCurrentClipboard: () => {
      void processor.convertCurrentClipboard();
    },
    previewClipboard: () => {
      showClipboardPreview(preview, settingsStore);
    },
    importShareLink: openShareImportWindow,
    openSettings: openSettingsWindow
  });

  pollTimer = setInterval(() => {
    void processor.poll();
  }, 750);

  notify("Running in the tray.", "info");
});

async function importSharedConversationStable(
  url: string,
  settings: ReturnType<SettingsStore["get"]>,
  responseId?: string
): Promise<Awaited<ReturnType<typeof importSharedConversation>>> {
  const first = await importSharedConversation(url, settings, responseId);

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

function shareImportStatus(source: "share-api" | "embedded-markdown" | "rendered-dom"): string {
  if (source === "share-api") {
    return "Imported clean shared-conversation Markdown and copied formatted content to the clipboard.";
  }

  if (source === "embedded-markdown") {
    return "Imported clean embedded conversation text and copied formatted content to the clipboard.";
  }

  return "Imported rendered shared-page HTML and copied formatted content to the clipboard.";
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

function showPreview(preview: ClipboardPreviewController, content: ClipboardPreviewContent): void {
  latestWordExport = {
    title: content.title,
    html: content.html,
    plainText: content.plainText
  };
  preview.show({
    ...content,
    canDownloadWord: true
  });
}

function showClipboardPreview(preview: ClipboardPreviewController, settingsStore: SettingsStore): void {
  const text = clipboard.readText();
  const html = clipboard.readHTML();
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

  if (detection.shouldConvert && text.length <= settingsStore.get().maxClipboardChars) {
    const conversion = convertToRichHtml(text, settingsStore.get());
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
    status: detection.reason,
    html: text.trim() ? convertToRichHtml(text, settingsStore.get()).html : "",
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
