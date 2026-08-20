import fs from "node:fs";
import path from "node:path";

let cachedKatexCss: string | undefined;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeMarkdownHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?!\/?(?:a|blockquote|br|code|div|em|h[1-6]|hr|li|ol|p|pre|s|span|strong|sub|sup|table|tbody|td|th|thead|tr|ul|math|semantics|annotation|mrow|mstyle|mpadded|mi|mn|mo|mtext|msub|msup|msubsup|mfrac|msqrt|mroot|mover|munder|munderover)\b)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*javascript:[^\s>]*/gi, "");
}

export function normalizeClipboardHtml(html: string): string {
  const cleaned = sanitizeMarkdownHtml(html.trim());
  if (!cleaned) {
    return "";
  }

  if (/<!doctype html>|<html[\s>]/i.test(cleaned)) {
    return cleaned;
  }

  return wrapClipboardHtml(cleaned, true);
}

export function getKatexCss(): string {
  if (cachedKatexCss !== undefined) {
    return cachedKatexCss;
  }

  try {
    const cssPath = require.resolve("katex/dist/katex.min.css");
    cachedKatexCss = fs.readFileSync(cssPath, "utf8");
  } catch {
    cachedKatexCss = "";
  }

  return cachedKatexCss;
}

export function wrapClipboardHtml(body: string, includeCss: boolean): string {
  const css = includeCss ? `${getKatexCss()}\n${appCss}` : appCss;

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    "<style>",
    css,
    "</style>",
    "</head>",
    '<body class="gptmath-doc">',
    body,
    "</body>",
    "</html>"
  ].join("");
}

const appCss = `
.gptmath-doc {
  color: #111827;
  font-family: Aptos, Calibri, "Segoe UI", Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
}
.gptmath-doc h1,
.gptmath-doc h2,
.gptmath-doc h3 {
  margin: 0.85em 0 0.35em;
  line-height: 1.2;
}
.gptmath-doc h1 {
  font-size: 16pt;
}
.gptmath-doc h2 {
  font-size: 14pt;
}
.gptmath-doc h3 {
  font-size: 12.5pt;
}
.gptmath-doc p,
.gptmath-doc ul,
.gptmath-doc ol,
.gptmath-doc table,
.gptmath-doc pre {
  margin: 0.45em 0;
}
.gptmath-doc table {
  border-collapse: collapse;
  width: auto;
}
.gptmath-doc th,
.gptmath-doc td {
  border: 1px solid #9ca3af;
  padding: 4px 8px;
  vertical-align: top;
}
.gptmath-doc th {
  background: #eef2f7;
  font-weight: 700;
}
.gptmath-doc code {
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 0.92em;
}
.gptmath-doc sub {
  vertical-align: sub;
  font-size: 0.75em;
}
.gptmath-doc sup {
  vertical-align: super;
  font-size: 0.75em;
}
.gptmath-doc pre {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  padding: 8px 10px;
  white-space: pre-wrap;
}
.gptmath-math-block {
  display: block;
  margin: 0.8em 0;
  text-align: center;
}
.gptmath-math-inline {
  display: inline;
}
.gptmath-diagram {
  margin: 0.65em 0;
}
`;

export function getRendererAssetPath(...parts: string[]): string {
  return path.join(__dirname, "..", ...parts);
}
