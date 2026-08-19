import katex from "katex";
import "katex/contrib/mhchem";
import MarkdownIt from "markdown-it";
import type { AppSettings, ConversionResult } from "../shared/types";
import { escapeHtml, sanitizeMarkdownHtml, wrapClipboardHtml } from "./html";

interface ConversionOptions {
  includeCss?: boolean;
}

interface MathToken {
  token: string;
  source: string;
  displayMode: boolean;
}

interface DiagramToken {
  token: string;
  source: string;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

export function convertToRichHtml(
  input: string,
  settings: Pick<AppSettings, "convertDiagrams">,
  options: ConversionOptions = {}
): ConversionResult {
  const warnings: string[] = [];
  const mathTokens: MathToken[] = [];
  const diagramTokens: DiagramToken[] = [];
  const codeBlocks: string[] = [];

  let prepared = input.replace(/```([a-zA-Z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)```/g, (match, language = "", source = "") => {
    if (settings.convertDiagrams && String(language).toLowerCase() === "mermaid") {
      const token = makeToken("DIAGRAM", diagramTokens.length);
      diagramTokens.push({ token, source: String(source).trim() });
      return token;
    }

    const token = makeToken("CODE", codeBlocks.length);
    codeBlocks.push(match);
    return token;
  });

  prepared = replaceMath(prepared, mathTokens);

  for (const [index, block] of codeBlocks.entries()) {
    prepared = prepared.replace(makeToken("CODE", index), block);
  }

  let body = sanitizeMarkdownHtml(md.render(prepared));

  for (const item of mathTokens) {
    const rendered = renderMath(item.source, item.displayMode, warnings);
    body = body.split(item.token).join(rendered);
  }

  for (const item of diagramTokens) {
    body = body.split(item.token).join(renderMermaidCard(item.source));
  }

  return {
    html: wrapClipboardHtml(body, options.includeCss ?? true),
    plainText: input,
    warnings
  };
}

function replaceMath(input: string, tokens: MathToken[]): string {
  let output = input;

  output = output.replace(/\$\$([\s\S]+?)\$\$/g, (_match, source: string) => addMathToken(tokens, source, true));
  output = output.replace(/\\\[([\s\S]+?)\\\]/g, (_match, source: string) => addMathToken(tokens, source, true));
  output = output.replace(/\\\(([\s\S]+?)\\\)/g, (_match, source: string) => addMathToken(tokens, source, false));

  output = output.replace(/(^|[^$])\$(?!\s|\$)([^$\n]+?)(?<!\s)\$(?!\$)/g, (match, prefix: string, source: string) => {
    if (!looksLikeMath(source)) {
      return match;
    }

    return `${prefix}${addMathToken(tokens, source, false)}`;
  });

  return output;
}

function looksLikeMath(source: string): boolean {
  return /\\[a-zA-Z]+|[=^_{}]|[+\-*/<>]/.test(source);
}

function addMathToken(tokens: MathToken[], source: string, displayMode: boolean): string {
  const token = makeToken("MATH", tokens.length);
  tokens.push({ token, source: source.trim(), displayMode });
  return token;
}

function renderMath(source: string, displayMode: boolean, warnings: string[]): string {
  try {
    const rendered = katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml"
    });
    const className = displayMode ? "gptmath-math-block" : "gptmath-math-inline";
    return `<span class="${className}" data-latex="${escapeHtml(source)}">${rendered}</span>`;
  } catch (error) {
    warnings.push(`Could not render formula: ${source}`);
    const className = displayMode ? "gptmath-math-block" : "gptmath-math-inline";
    return `<code class="${className}" data-latex="${escapeHtml(source)}">${escapeHtml(source)}</code>`;
  }
}

function renderMermaidCard(source: string): string {
  const flowchart = renderSimpleMermaidFlowchart(source);
  if (flowchart) {
    return flowchart;
  }

  const escapedSource = escapeHtml(source);
  const svgText = escapeHtml(source.length > 320 ? `${source.slice(0, 317)}...` : source);

  return [
    '<div class="gptmath-diagram" data-diagram-language="mermaid">',
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="180" viewBox="0 0 720 180" role="img" aria-label="Mermaid diagram source">',
    '<rect x="0" y="0" width="720" height="180" rx="8" fill="#f8fafc" stroke="#94a3b8"/>',
    '<text x="24" y="34" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">Mermaid diagram</text>',
    '<text x="24" y="62" font-family="Consolas, monospace" font-size="12" fill="#334155">',
    svgText,
    "</text>",
    "</svg>",
    `<pre><code class="language-mermaid">${escapedSource}</code></pre>`,
    "</div>"
  ].join("");
}

function renderSimpleMermaidFlowchart(source: string): string | undefined {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines[0]?.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)$/i);
  if (!header) {
    return undefined;
  }

  const direction = header[1].toUpperCase();
  const edgeLines = lines.slice(1);
  const labels = new Map<string, string>();
  const edges: Array<[string, string]> = [];

  for (const line of edgeLines) {
    const parsed = parseMermaidEdge(line);
    if (!parsed) {
      return undefined;
    }

    labels.set(parsed.fromId, parsed.fromLabel);
    labels.set(parsed.toId, parsed.toLabel);
    edges.push([parsed.fromId, parsed.toId]);
  }

  if (edges.length === 0 || labels.size > 8) {
    return undefined;
  }

  const nodes = Array.from(labels.entries());
  const horizontal = direction === "LR" || direction === "RL";
  const width = horizontal ? Math.max(360, nodes.length * 150) : 520;
  const height = horizontal ? 190 : Math.max(210, nodes.length * 86);
  const nodeWidth = 112;
  const nodeHeight = 42;
  const positions = new Map<string, { x: number; y: number }>();

  nodes.forEach(([id], index) => {
    const orderedIndex = direction === "BT" || direction === "RL" ? nodes.length - index - 1 : index;
    const x = horizontal ? 34 + orderedIndex * 142 : width / 2 - nodeWidth / 2;
    const y = horizontal ? height / 2 - nodeHeight / 2 : 34 + orderedIndex * 76;
    positions.set(id, { x, y });
  });

  const edgeSvg = edges
    .map(([from, to]) => {
      const a = positions.get(from);
      const b = positions.get(to);
      if (!a || !b) {
        return "";
      }

      const startX = horizontal ? a.x + nodeWidth : a.x + nodeWidth / 2;
      const startY = horizontal ? a.y + nodeHeight / 2 : a.y + nodeHeight;
      const endX = horizontal ? b.x : b.x + nodeWidth / 2;
      const endY = horizontal ? b.y + nodeHeight / 2 : b.y;
      return `<path d="M ${startX} ${startY} L ${endX} ${endY}" stroke="#2563eb" stroke-width="2" fill="none" marker-end="url(#arrow)"/>`;
    })
    .join("");

  const nodeSvg = nodes
    .map(([id, label]) => {
      const position = positions.get(id);
      if (!position) {
        return "";
      }

      return [
        `<rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="7" fill="#ffffff" stroke="#64748b"/>`,
        `<text x="${position.x + nodeWidth / 2}" y="${position.y + 26}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#0f172a">${escapeHtml(label)}</text>`
      ].join("");
    })
    .join("");

  return [
    '<div class="gptmath-diagram" data-diagram-language="mermaid">',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid diagram">`,
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#2563eb"/></marker></defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>`,
    edgeSvg,
    nodeSvg,
    "</svg>",
    `<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>`,
    "</div>"
  ].join("");
}

function parseMermaidEdge(line: string):
  | { fromId: string; fromLabel: string; toId: string; toLabel: string }
  | undefined {
  const edgePattern = /^\s*([A-Za-z0-9_]+)(?:\[(?:"([^"]+)"|([^\]]+))\])?\s*(?:-->|---\>|==>)\s*([A-Za-z0-9_]+)(?:\[(?:"([^"]+)"|([^\]]+))\])?\s*;?\s*$/;
  const match = line.match(edgePattern);
  if (!match) {
    return undefined;
  }

  return {
    fromId: match[1],
    fromLabel: match[2] ?? match[3] ?? match[1],
    toId: match[4],
    toLabel: match[5] ?? match[6] ?? match[4]
  };
}

function makeToken(kind: string, index: number): string {
  return `%%GPTMATH_${kind}_${index}%%`;
}
