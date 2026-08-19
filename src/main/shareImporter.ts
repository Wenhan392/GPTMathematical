import { BrowserWindow } from "electron";
import { convertToRichHtml } from "../conversion/convert";
import { normalizeClipboardHtml, wrapClipboardHtml } from "../conversion/html";
import { stripChatGptArtifacts } from "../shared/chatgptArtifacts";
import type { AppSettings, ConversionResult } from "../shared/types";

export interface ImportedShareConversation {
  title: string;
  url: string;
  source: "share-api" | "embedded-markdown" | "rendered-dom";
  conversion: ConversionResult;
  responseOptions: ShareResponseOption[];
  selectedResponseId: string;
}

export interface ShareResponseOption {
  id: string;
  label: string;
}

interface ExtractedShareContent {
  title: string;
  markdownCandidates: string[];
  domHtml: string;
  domText: string;
  domMarkdownText: string;
}

export async function importSharedConversation(url: string, settings: AppSettings, responseId = "all"): Promise<ImportedShareConversation> {
  const parsedUrl = validateShareUrl(url);
  const apiConversation = await fetchSharedConversationFromApi(parsedUrl, settings, responseId);
  if (apiConversation) {
    return apiConversation;
  }

  const extracted = await extractSharedPage(parsedUrl);
  const markdown = chooseBestMarkdownCandidate([...extracted.markdownCandidates, extracted.domMarkdownText]);

  if (markdown) {
    return {
      title: extracted.title || "Imported ChatGPT conversation",
      url: parsedUrl,
      source: "embedded-markdown",
      conversion: convertToRichHtml(markdown, settings),
      responseOptions: [{ id: "all", label: "Whole imported content" }],
      selectedResponseId: "all"
    };
  }

  const domText = stripChatGptArtifacts(extracted.domText);
  const domHtml = stripChatGptArtifacts(extracted.domHtml);
  const html = normalizeClipboardHtml(domHtml || wrapClipboardHtml(`<pre>${escapeHtml(domText)}</pre>`, true));
  return {
    title: extracted.title || "Imported ChatGPT conversation",
    url: parsedUrl,
    source: "rendered-dom",
    conversion: {
      html,
      plainText: domText,
      warnings: ["Could not find embedded Markdown; used rendered page HTML instead."]
    },
    responseOptions: [{ id: "all", label: "Whole imported content" }],
    selectedResponseId: "all"
  };
}

function validateShareUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Enter a valid ChatGPT share URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Share URL must start with http:// or https://.");
  }

  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(parsed.hostname)) {
    throw new Error("For this importer, use a public ChatGPT shared conversation link.");
  }

  return parsed.toString();
}

async function fetchSharedConversationFromApi(url: string, settings: AppSettings, responseId: string): Promise<ImportedShareConversation | undefined> {
  const shareId = extractShareId(url);
  if (!shareId) {
    return undefined;
  }

  const endpoint = `https://chatgpt.com/backend-api/share/${encodeURIComponent(shareId)}`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      return undefined;
    }

    const parsed = sharePayloadToMarkdown(await response.json(), responseId);
    if (!parsed) {
      return undefined;
    }

    return {
      title: parsed.title,
      url,
      source: "share-api",
      conversion: convertToRichHtml(parsed.markdown, settings),
      responseOptions: parsed.responseOptions,
      selectedResponseId: parsed.selectedResponseId
    };
  } catch {
    return undefined;
  }
}

function extractShareId(url: string): string | undefined {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const shareIndex = segments.findIndex((segment) => segment.toLowerCase() === "share");
  const firstShareSegment = shareIndex >= 0 ? segments[shareIndex + 1] : undefined;
  const shareId = firstShareSegment === "e" ? segments[shareIndex + 2] : firstShareSegment;
  return shareId ? decodeURIComponent(shareId) : undefined;
}

export function sharePayloadToMarkdown(
  payload: unknown,
  responseId = "all"
): { title: string; markdown: string; responseOptions: ShareResponseOption[]; selectedResponseId: string } | undefined {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  const title = firstString(root.title, asRecord(root.conversation)?.title) ?? "Imported ChatGPT conversation";
  const messages = extractLinearConversationMessages(root);
  const visibleMessages = messages
    .map((message, index) => extractShareMessage(message, index))
    .filter((message): message is ShareMessageMarkdown => Boolean(message && message.markdown.trim()));

  if (visibleMessages.length === 0) {
    return undefined;
  }

  const labelledMessages = labelShareMessages(visibleMessages);
  const assistantMessages = labelledMessages.filter((message) => message.role === "assistant");
  const responseOptions = [
    { id: "all", label: "Whole chat" },
    ...assistantMessages.map((message, index) => ({
      id: message.id,
      label: `Assistant response ${index + 1}: ${summarizeResponse(message.markdown)}`
    }))
  ];
  const selectedMessage = assistantMessages.find((message) => message.id === responseId);
  const selectedResponseId = selectedMessage ? selectedMessage.id : "all";
  const exportMessages = selectedMessage ? [selectedMessage] : labelledMessages;
  const markdown = exportMessages.length === 1
    ? `## ${exportMessages[0].label}\n\n${exportMessages[0].markdown}`
    : exportMessages.map((message) => {
      return `## ${message.label}\n\n${message.markdown}`;
    }).join("\n\n---\n\n");

  return {
    title,
    markdown: cleanCandidateText(markdown),
    responseOptions,
    selectedResponseId
  };
}

interface ShareMessageMarkdown {
  id: string;
  role: string;
  label?: string;
  markdown: string;
}

function labelShareMessages(messages: ShareMessageMarkdown[]): Array<ShareMessageMarkdown & { label: string }> {
  let userCount = 0;
  let assistantCount = 0;
  let otherCount = 0;

  return messages.map((message) => {
    if (message.role === "user") {
      userCount += 1;
      return { ...message, label: `User request ${userCount}` };
    }

    if (message.role === "assistant") {
      assistantCount += 1;
      return { ...message, label: `GPT response ${assistantCount}` };
    }

    otherCount += 1;
    return { ...message, label: `Message ${otherCount}` };
  });
}

function extractLinearConversationMessages(root: Record<string, unknown>): unknown[] {
  if (Array.isArray(root.linear_conversation)) {
    return root.linear_conversation;
  }

  const conversation = asRecord(root.conversation);
  if (conversation && Array.isArray(conversation.linear_conversation)) {
    return conversation.linear_conversation;
  }

  const mapping = asRecord(root.mapping) ?? asRecord(conversation?.mapping);
  if (!mapping) {
    return [];
  }

  return Object.values(mapping);
}

function extractShareMessage(entry: unknown, index: number): ShareMessageMarkdown | undefined {
  const entryRecord = asRecord(entry);
  if (!entryRecord) {
    return undefined;
  }

  const message = asRecord(entryRecord.message) ?? entryRecord;
  const metadata = asRecord(message.metadata);
  if (metadata?.is_visually_hidden_from_conversation === true) {
    return undefined;
  }

  const role = firstString(asRecord(message.author)?.role, message.role) ?? "message";
  if (["system", "tool"].includes(role)) {
    return undefined;
  }

  const content = asRecord(message.content);
  const markdown = content
    ? extractContentText(content)
    : firstString(message.text, message.markdown, message.body) ?? "";

  return {
    id: firstString(message.id, entryRecord.id) ?? `message-${index}`,
    role,
    markdown: cleanCandidateText(markdown)
  };
}

function summarizeResponse(markdown: string): string {
  const summary = markdown
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, " equation ")
    .replace(/[#*_`>\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (summary || "Math response").slice(0, 72);
}

function extractContentText(content: Record<string, unknown>): string {
  if (Array.isArray(content.parts)) {
    return content.parts.map(partToText).filter(Boolean).join("\n");
  }

  return firstString(content.text, content.markdown, content.body) ?? "";
}

function partToText(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  const record = asRecord(part);
  if (!record) {
    return "";
  }

  return firstString(record.text, record.content, record.markdown, record.body) ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

async function extractSharedPage(url: string): Promise<ExtractedShareContent> {
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await loadUrl(win, url);
    await delay(2500);

    return await win.webContents.executeJavaScript(extractionScript, true) as ExtractedShareContent;
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

function loadUrl(win: BrowserWindow, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out loading the shared conversation.")), 30_000);

    win.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
    win.webContents.once("did-fail-load", (_event, _code, description) => {
      clearTimeout(timeout);
      reject(new Error(description || "Could not load the shared conversation."));
    });

    void win.loadURL(url);
  });
}

export function chooseBestMarkdownCandidate(candidates: string[]): string | undefined {
  const cleaned = Array.from(new Set(candidates.map(cleanCandidateText).filter((candidate) => candidate && !isBootstrapOrConfigBlob(candidate))));
  const richCandidates = cleaned.filter((candidate) => hasDocumentSignals(candidate));
  const pool = richCandidates.length > 0 ? richCandidates : cleaned;

  return pool.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
}

function cleanCandidateText(text: string): string {
  return stripChatGptArtifacts(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function hasDocumentSignals(text: string): boolean {
  return /\\(?:frac|sqrt|int|sum|ce|begin|alpha|rho|mu|pi)\b|\$\$|\\\[|\\\(|\|.+\||```|[∫∑√≈≤≥±×]/.test(text);
}

function scoreCandidate(text: string): number {
  if (isBootstrapOrConfigBlob(text)) {
    return Number.NEGATIVE_INFINITY;
  }

  const latexSignals = (text.match(/\\(?:frac|sqrt|int|sum|ce|begin|alpha|rho|mu|pi|text|bar|approx|times|cdot)\b|\$\$|\\\[|\\\(/g) ?? []).length;
  const unicodeMathSignals = (text.match(/[∫∑√≈≤≥±×]/g) ?? []).length;
  const markdownSignals = (text.match(/^#{1,6}\s|^\s*[-*]\s|^\s*\|.+\|/gm) ?? []).length;
  const tableSignals = (text.match(/^\|.+\|\s*$/gm) ?? []).length;
  const paragraphSignals = (text.match(/\n\s*\n/g) ?? []).length;
  const flattenedMathPenalty = latexSignals === 0 && /\b(?:A|D|U|Re)\d\b|πD\d|U\d=|Re\d=/.test(text) ? 4_000 : 0;
  return Math.min(text.length, 50_000)
    + latexSignals * 2_000
    + unicodeMathSignals * 150
    + markdownSignals * 160
    + tableSignals * 700
    + paragraphSignals * 25
    - flattenedMathPenalty;
}

function isBootstrapOrConfigBlob(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const configMarkers = [
    "feature_gates",
    "secondary_exposures",
    "statsigEnvironment",
    "sdkInfo",
    "evaluated_keys",
    "rule_id",
    "gateValue",
    "undelegated_secondary_exposures",
    "WebAnonymousCookieID"
  ];
  const markerHits = configMarkers.filter((marker) => trimmed.includes(marker)).length;
  if (markerHits >= 2) {
    return true;
  }

  const looksLikeJson = /^[\[{]/.test(trimmed) && /[}\]]$/.test(trimmed);
  if (!looksLikeJson) {
    return false;
  }

  const quoteCount = (trimmed.match(/"/g) ?? []).length;
  const colonCount = (trimmed.match(/:/g) ?? []).length;
  const newlineCount = (trimmed.match(/\n/g) ?? []).length;
  const jsonDensity = trimmed.length > 0 ? (quoteCount + colonCount) / trimmed.length : 0;
  return trimmed.length > 6_000 && newlineCount < 6 && jsonDensity > 0.08;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const extractionScript = `
(() => {
  const isBootstrapOrConfigBlob = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return true;
    const configMarkers = [
      'feature_gates',
      'secondary_exposures',
      'statsigEnvironment',
      'sdkInfo',
      'evaluated_keys',
      'rule_id',
      'gateValue',
      'undelegated_secondary_exposures',
      'WebAnonymousCookieID'
    ];
    const markerHits = configMarkers.filter((marker) => trimmed.includes(marker)).length;
    if (markerHits >= 2) return true;
    const looksLikeJson = /^[\\[{]/.test(trimmed) && /[}\\]]$/.test(trimmed);
    if (!looksLikeJson) return false;
    const quoteCount = (trimmed.match(/"/g) || []).length;
    const colonCount = (trimmed.match(/:/g) || []).length;
    const newlineCount = (trimmed.match(/\\n/g) || []).length;
    const jsonDensity = trimmed.length > 0 ? (quoteCount + colonCount) / trimmed.length : 0;
    return trimmed.length > 6000 && newlineCount < 6 && jsonDensity > 0.08;
  };

  const cloneForExport = (node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, button, textarea, input, select, nav, aside, form, [contenteditable="true"], [aria-label*="Copy"], [data-testid*="copy"]').forEach((el) => el.remove());
    clone.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') || '';
      const kept = style.split(';').map((part) => part.trim()).filter((part) => /^(text-align|font-style|font-weight|display|margin|padding|border-collapse|vertical-align)\\s*:/i.test(part));
      if (kept.length) {
        el.setAttribute('style', kept.join('; '));
      } else {
        el.removeAttribute('style');
      }
    });
    return clone;
  };

  const mathOperatorMap = {
    'π': '\\\\pi',
    'Π': '\\\\Pi',
    'ρ': '\\\\rho',
    'μ': '\\\\mu',
    'θ': '\\\\theta',
    'λ': '\\\\lambda',
    'α': '\\\\alpha',
    'β': '\\\\beta',
    'γ': '\\\\gamma',
    'Δ': '\\\\Delta',
    '∞': '\\\\infty',
    '≈': '\\\\approx',
    '≠': '\\\\ne',
    '≤': '\\\\le',
    '≥': '\\\\ge',
    '×': '\\\\times',
    '·': '\\\\cdot',
    '±': '\\\\pm',
    '−': '-',
    '→': '\\\\to'
  };

  const cleanMathText = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
  const group = (value) => {
    const cleaned = cleanMathText(value);
    return cleaned.length === 1 || /^\\\\[A-Za-z]+$/.test(cleaned) ? cleaned : '{' + cleaned + '}';
  };

  const mathmlToLatex = (node) => {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return cleanMathText(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const name = node.localName.toLowerCase();
    const children = Array.from(node.childNodes);
    const childLatex = () => children.map(mathmlToLatex).filter(Boolean).join(' ');

    if (name === 'annotation') return '';
    if (name === 'semantics') return mathmlToLatex(children.find((child) => child.nodeType === Node.ELEMENT_NODE && child.localName !== 'annotation'));
    if (name === 'math' || name === 'mrow' || name === 'mstyle' || name === 'mpadded') return childLatex();
    if (name === 'mi' || name === 'mn') {
      const text = cleanMathText(node.textContent || '');
      return mathOperatorMap[text] || text;
    }
    if (name === 'mo') {
      const text = cleanMathText(node.textContent || '');
      return mathOperatorMap[text] || text;
    }
    if (name === 'mtext') return '\\\\text{' + cleanMathText(node.textContent || '') + '}';
    if (name === 'msub') return mathmlToLatex(children[0]) + '_' + group(mathmlToLatex(children[1]));
    if (name === 'msup') return mathmlToLatex(children[0]) + '^' + group(mathmlToLatex(children[1]));
    if (name === 'msubsup') return mathmlToLatex(children[0]) + '_' + group(mathmlToLatex(children[1])) + '^' + group(mathmlToLatex(children[2]));
    if (name === 'mfrac') return '\\\\frac{' + mathmlToLatex(children[0]) + '}{' + mathmlToLatex(children[1]) + '}';
    if (name === 'msqrt') return '\\\\sqrt{' + childLatex() + '}';
    if (name === 'mroot') return '\\\\sqrt[' + mathmlToLatex(children[1]) + ']{' + mathmlToLatex(children[0]) + '}';
    if (name === 'mover') return '\\\\bar{' + mathmlToLatex(children[0]) + '}';
    if (name === 'munder') return mathmlToLatex(children[0]) + '_{' + mathmlToLatex(children[1]) + '}';
    if (name === 'munderover') return mathmlToLatex(children[0]) + '_{' + mathmlToLatex(children[1]) + '}^{' + mathmlToLatex(children[2]) + '}';

    return childLatex();
  };

  const extractLatex = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    const dataLatex = node.getAttribute('data-latex') || node.getAttribute('data-tex');
    if (dataLatex && /\\\\|[_^=+\\-*/]|[A-Za-z]/.test(dataLatex)) return cleanMathText(dataLatex);

    const annotation = node.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"], annotation[encoding*="latex"], annotation[encoding*="LaTeX"]');
    if (annotation && annotation.textContent) return cleanMathText(annotation.textContent);

    const mathNode = node.localName && node.localName.toLowerCase() === 'math' ? node : node.querySelector('math');
    if (mathNode) return cleanMathText(mathmlToLatex(mathNode));

    return '';
  };

  const replaceRenderedMath = (rootNode) => {
    const mathNodes = Array.from(rootNode.querySelectorAll('.katex, math, [data-latex], [data-tex]'))
      .filter((node) => !node.closest('.gptmath-imported-math'));

    mathNodes.forEach((node) => {
      if (!node.isConnected) return;
      if (node.closest('.katex') && !node.classList.contains('katex')) return;

      const latex = extractLatex(node);
      if (!latex) return;

      const isDisplay = node.classList.contains('katex-display') || Boolean(node.closest('.katex-display')) || node.getAttribute('display') === 'block';
      const span = document.createElement('span');
      span.className = 'gptmath-imported-math';
      span.textContent = isDisplay ? '\\n\\n$$' + latex + '$$\\n\\n' : '$' + latex + '$';
      node.replaceWith(span);
    });
  };

  const blockText = (node) => Array.from(node.childNodes).map(nodeToMarkdown).join('').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
  const inlineText = (node) => Array.from(node.childNodes).map(nodeToMarkdown).join('').replace(/\\s+/g, ' ').trim();
  const escapeTableCell = (text) => String(text || '').replace(/\\s+/g, ' ').replace(/\\|/g, '\\\\|').trim();
  const tableToMarkdown = (table) => {
    const rows = Array.from(table.querySelectorAll('tr'))
      .map((row) => Array.from(row.children)
        .filter((cell) => /^(td|th)$/i.test(cell.tagName))
        .map((cell) => escapeTableCell(blockText(cell))))
      .filter((cells) => cells.length > 0);

    if (!rows.length) return '';
    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
    const header = normalized[0];
    const separator = Array(width).fill('---');
    const body = normalized.slice(1);
    return [
      '| ' + header.join(' | ') + ' |',
      '| ' + separator.join(' | ') + ' |',
      ...body.map((row) => '| ' + row.join(' | ') + ' |')
    ].join('\\n');
  };

  const nodeToMarkdown = (node) => {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role') || '';
    if (tag === 'br') return '\\n';
    if (tag === 'script' || tag === 'style' || tag === 'button' || tag === 'svg') return '';
    if (/^h[1-6]$/.test(tag)) return '\\n\\n' + '#'.repeat(Number(tag.slice(1))) + ' ' + blockText(node) + '\\n\\n';
    if (tag === 'sub') return '<sub>' + inlineText(node) + '</sub>';
    if (tag === 'sup') return '<sup>' + inlineText(node) + '</sup>';
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') return '\\n\\n' + blockText(node) + '\\n\\n';
    if (tag === 'li' || role === 'listitem') return '\\n- ' + blockText(node);
    if (tag === 'ul' || role === 'list') return '\\n' + Array.from(node.children).map(nodeToMarkdown).join('') + '\\n';
    if (tag === 'ol') return '\\n' + Array.from(node.children).map((child, index) => {
      const itemText = blockText(child);
      return itemText ? '\\n' + String(index + 1) + '. ' + itemText : '';
    }).join('') + '\\n';
    if (tag === 'pre') return '\\n\\n\\x60\\x60\\x60\\n' + (node.innerText || '') + '\\n\\x60\\x60\\x60\\n\\n';
    if (tag === 'code') return '\\x60' + (node.innerText || '') + '\\x60';
    if (tag === 'strong' || tag === 'b') return '**' + blockText(node) + '**';
    if (tag === 'em' || tag === 'i') return '*' + blockText(node) + '*';
    if (tag === 'table') return '\\n\\n' + tableToMarkdown(node) + '\\n\\n';

    return Array.from(node.childNodes).map(nodeToMarkdown).join('');
  };

  const cloneToMarkdown = (node) => {
    const clone = cloneForExport(node);
    replaceRenderedMath(clone);
    return blockText(clone);
  };

  const markdownCandidates = [];
  const visit = (value, depth = 0) => {
    if (depth > 14 || value == null) return;
    if (typeof value === 'string') {
      if (value.length > 80 && !isBootstrapOrConfigBlob(value) && /(?:\\\\(?:frac|sqrt|int|sum|ce|begin|alpha|rho|mu|pi)\\b|\\$\\$|\\\\\\[|\\\\\\(|\\|.+\\||\\x60\\x60\\x60|[∫∑√≈≤≥±×])/.test(value)) {
        markdownCandidates.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      if (value.feature_gates || value.dynamic_configs || value.layer_configs || value.sdkInfo || value.statsigEnvironment || value.evaluated_keys) {
        return;
      }
      Object.entries(value).forEach(([key, item]) => {
        if (/^(text|content|parts|message|messages|markdown|body)$/i.test(key) || (depth < 4 && !/feature|gate|statsig|experiment|exposure|config|rule|sdk/i.test(key))) {
          visit(item, depth + 1);
        }
      });
    }
  };

  document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__, script').forEach((script) => {
    const raw = script.textContent || '';
    if (!raw || raw.length < 100) return;
    try {
      visit(JSON.parse(raw));
    } catch {
      const matches = raw.match(/"(?:[^"\\\\]|\\\\.){80,}"/g) || [];
      matches.slice(0, 500).forEach((match) => {
        try {
          const decoded = JSON.parse(match);
          if (typeof decoded === 'string' && !isBootstrapOrConfigBlob(decoded)) visit(decoded);
        } catch {}
      });
    }
  });

  const messageNodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
  const root = messageNodes.length
    ? document.createElement('main')
    : cloneForExport(document.querySelector('main') || document.querySelector('article') || document.body);

  if (messageNodes.length) {
    messageNodes.forEach((message) => {
      const role = message.getAttribute('data-message-author-role') || 'message';
      const section = document.createElement('section');
      section.className = 'gptmath-imported-message gptmath-imported-' + role;
      const heading = document.createElement('h2');
      heading.textContent = role === 'assistant' ? 'Assistant' : role === 'user' ? 'User' : role;
      section.appendChild(heading);
      section.appendChild(cloneForExport(message));
      root.appendChild(section);
    });
  }

  const markdownRoot = messageNodes.length ? document.createElement('main') : null;
  let domMarkdownText = '';
  if (messageNodes.length) {
    domMarkdownText = messageNodes.map((message) => {
      const role = message.getAttribute('data-message-author-role') || 'message';
      const heading = role === 'assistant' ? 'Assistant' : role === 'user' ? 'User' : role;
      return '## ' + heading + '\\n\\n' + cloneToMarkdown(message);
    }).join('\\n\\n');
  } else {
    domMarkdownText = cloneToMarkdown(document.querySelector('main') || document.querySelector('article') || document.body);
  }

  return {
    title: document.title || 'Imported ChatGPT conversation',
    markdownCandidates,
    domHtml: root.innerHTML || '',
    domText: root.innerText || document.body.innerText || '',
    domMarkdownText
  };
})()
`;
