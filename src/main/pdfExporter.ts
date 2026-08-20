import fs from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import { escapeHtml, wrapClipboardHtml } from "../conversion/html";
import type { WordExportContent } from "./docxExporter";

export function suggestPdfFilename(title: string): string {
  const base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "ChatGPT formatted conversation";
  return `${base}.pdf`;
}

export async function writePdfDocument(filePath: string, content: WordExportContent): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const win = new BrowserWindow({
    width: 920,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await loadHtml(win, buildPdfHtml(content));
    await delay(250);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: {
        marginType: "default"
      }
    });
    fs.writeFileSync(filePath, pdf);
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

function buildPdfHtml(content: WordExportContent): string {
  const sourceHtml = content.html.trim()
    ? content.html
    : wrapClipboardHtml(`<pre>${escapeHtml(content.plainText)}</pre>`, true);
  const body = extractBody(sourceHtml);
  const styles = extractStyles(sourceHtml);

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    "<style>",
    styles,
    printCss,
    "</style>",
    "</head>",
    '<body class="gptmath-doc">',
    `<h1 class="gptmath-pdf-title">${escapeHtml(content.title)}</h1>`,
    body,
    "</body>",
    "</html>"
  ].join("");
}

function extractBody(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function extractStyles(html: string): string {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join("\n");
}

function loadHtml(win: BrowserWindow, html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out preparing the PDF export.")), 30_000);

    win.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
    win.webContents.once("did-fail-load", (_event, _code, description) => {
      clearTimeout(timeout);
      reject(new Error(description || "Could not prepare the PDF export."));
    });

    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const printCss = `
@page {
  margin: 18mm 16mm;
}
body {
  background: #ffffff !important;
}
.gptmath-pdf-title {
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #cbd5e1;
  color: #0f172a;
  font-family: Aptos, Calibri, "Segoe UI", Arial, sans-serif;
  font-size: 18pt;
  line-height: 1.2;
}
pre,
table,
.katex-display,
.gptmath-math-block {
  break-inside: avoid;
}
`;
