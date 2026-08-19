import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { stripChatGptArtifacts } from "../shared/chatgptArtifacts";

export interface WordExportContent {
  title: string;
  html: string;
  plainText: string;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

interface CentralDirectoryEntry {
  name: string;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
}

type InlineToken =
  | { kind: "text"; value: string; bold?: boolean; italic?: boolean }
  | { kind: "math"; value: string };

interface MarkdownTable {
  rows: string[][];
  endIndex: number;
}

const crcTable = makeCrcTable();

export function suggestDocxFilename(title: string): string {
  const base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "ChatGPT formatted conversation";
  return `${base}.docx`;
}

export function writeWordDocument(filePath: string, content: WordExportContent): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, createWordDocumentBuffer(content));
}

export function createWordDocumentBuffer(content: WordExportContent): Buffer {
  return createZip([
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
    },
    {
      name: "word/document.xml",
      data: utf8(buildDocumentXml(content))
    }
  ]);
}

function buildDocumentXml(content: WordExportContent): string {
  const body = [
    documentTitleParagraph(content.title),
    markdownToWordBody(content.plainText.trim() || htmlToReadableText(content.html))
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function markdownToWordBody(markdown: string): string {
  const lines = normalizeMarkdownMath(stripChatGptArtifacts(markdown)).split(/\r?\n/);
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed === "$$" || trimmed === "\\[") {
      const endMarker = trimmed === "$$" ? "$$" : "\\]";
      const mathLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== endMarker) {
        mathLines.push(lines[index]);
        index += 1;
      }
      blocks.push(mathParagraph(mathLines.join("\n")));
      continue;
    }

    const fencedDisplay = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
    if (fencedDisplay) {
      blocks.push(mathParagraph(fencedDisplay[1]));
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(wordTable(table.rows));
      index = table.endIndex;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(horizontalRule());
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const roleHeading = parseRoleHeading(heading[2]);
      if (roleHeading) {
        blocks.push(roleHeadingParagraph(roleHeading));
        continue;
      }

      blocks.push(textParagraph(parseInlineMarkdown(heading[2]), { headingLevel: Math.min(3, heading[1].length) }));
      continue;
    }

    const list = trimmed.match(/^[-*]\s+(.+)$/);
    if (list) {
      blocks.push(textParagraph(parseInlineMarkdown(list[1]), { bullet: true }));
      continue;
    }

    const orderedList = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedList) {
      blocks.push(textParagraph(parseInlineMarkdown(orderedList[1]), { bullet: true }));
      continue;
    }

    blocks.push(textParagraph(parseInlineMarkdown(trimmed)));
  }

  return blocks.join("\n");
}

function parseRoleHeading(text: string): { role: "user" | "gpt" | "message"; text: string } | undefined {
  if (/^User request \d+$/i.test(text)) {
    return { role: "user", text };
  }

  if (/^GPT response \d+$/i.test(text)) {
    return { role: "gpt", text };
  }

  if (/^Message \d+$/i.test(text)) {
    return { role: "message", text };
  }

  return undefined;
}

function normalizeMarkdownMath(markdown: string): string {
  return markdown
    .replace(/\\\[/g, "\n\\[\n")
    .replace(/\\\]/g, "\n\\]\n")
    .replace(/\$\$/g, "\n$$\n")
    .replace(/\n{3,}/g, "\n\n");
}

function parseTable(lines: string[], startIndex: number): MarkdownTable | undefined {
  const first = lines[startIndex].trim();
  const second = lines[startIndex + 1]?.trim() ?? "";
  if (!isTableRow(first) || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(second)) {
    return undefined;
  }

  const rows: string[][] = [splitTableRow(first)];
  let index = startIndex + 2;
  while (index < lines.length && isTableRow(lines[index].trim())) {
    rows.push(splitTableRow(lines[index].trim()));
    index += 1;
  }

  return { rows, endIndex: index - 1 };
}

function isTableRow(line: string): boolean {
  return line.includes("|") && /^\|?.+\|.+\|?$/.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function wordTable(rows: string[][]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
      <w:insideH w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
      <w:insideV w:val="single" w:sz="6" w:space="0" w:color="9CA3AF"/>
    </w:tblBorders>
  </w:tblPr>
  ${normalized.map((row, rowIndex) => `<w:tr>${row.map((cell) => `<w:tc>
    <w:tcPr>
      <w:tcW w:w="2400" w:type="dxa"/>
      <w:tcMar>
        <w:top w:w="90" w:type="dxa"/>
        <w:left w:w="110" w:type="dxa"/>
        <w:bottom w:w="90" w:type="dxa"/>
        <w:right w:w="110" w:type="dxa"/>
      </w:tcMar>
      ${rowIndex === 0 ? '<w:shd w:fill="F1F5F9"/>' : ""}
    </w:tcPr>
    ${textParagraph(parseInlineMarkdown(cell), { bold: rowIndex === 0 })}
  </w:tc>`).join("")}</w:tr>`).join("\n")}
</w:tbl>`;
}

function documentTitleParagraph(title: string): string {
  const cleanedTitle = title.trim() || "ChatGPT formatted export";
  return `<w:p>
  <w:pPr>
    <w:spacing w:before="0" w:after="220"/>
    <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="CBD5E1"/></w:pBdr>
    <w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="111827"/></w:rPr>
  </w:pPr>
  ${wordRun(cleanedTitle, { bold: true, size: 34 })}
</w:p>`;
}

function roleHeadingParagraph(heading: { role: "user" | "gpt" | "message"; text: string }): string {
  const fill = heading.role === "user" ? "EFF6FF" : heading.role === "gpt" ? "F0FDF4" : "F8FAFC";
  const border = heading.role === "user" ? "60A5FA" : heading.role === "gpt" ? "4ADE80" : "94A3B8";
  return `<w:p>
  <w:pPr>
    <w:spacing w:before="260" w:after="120"/>
    <w:shd w:fill="${fill}"/>
    <w:pBdr><w:left w:val="single" w:sz="18" w:space="5" w:color="${border}"/></w:pBdr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr>
  </w:pPr>
  ${wordRun(heading.text, { bold: true, size: 24 })}
</w:p>`;
}

function horizontalRule(): string {
  return `<w:p>
  <w:pPr>
    <w:spacing w:before="180" w:after="140"/>
    <w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="E2E8F0"/></w:pBdr>
  </w:pPr>
</w:p>`;
}

function textParagraph(tokens: InlineToken[], options: { headingLevel?: number; bullet?: boolean; bold?: boolean } = {}): string {
  const properties: string[] = [];
  if (options.headingLevel) {
    const size = options.headingLevel === 1 ? 32 : options.headingLevel === 2 ? 28 : 25;
    properties.push(`<w:pStyle w:val="Heading${options.headingLevel}"/>`);
    properties.push(`<w:spacing w:before="180" w:after="80"/>`);
    properties.push(`<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr>`);
  } else {
    properties.push('<w:spacing w:before="70" w:after="70"/>');
  }

  if (options.bullet) {
    properties.push('<w:ind w:left="720" w:hanging="360"/>');
  }

  const bullet = options.bullet ? wordRun("• ", {}) : "";
  const runs = tokens.map((token) => token.kind === "math"
    ? inlineMath(token.value)
    : wordRun(token.value, { bold: options.bold || token.bold, italic: token.italic })).join("");

  return `<w:p><w:pPr>${properties.join("")}</w:pPr>${bullet}${runs}</w:p>`;
}

function mathParagraph(latex: string): string {
  return `<w:p>
  <w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>
  <m:oMathPara>
    <m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>
    <m:oMath>${latexToOmml(latex)}</m:oMath>
  </m:oMathPara>
</w:p>`;
}

function inlineMath(latex: string): string {
  return `<m:oMath>${latexToOmml(latex)}</m:oMath>`;
}

function parseInlineMarkdown(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;

  const pushText = (value: string, style: Pick<InlineToken & { kind: "text" }, "bold" | "italic"> = {}) => {
    if (value) {
      tokens.push({ kind: "text", value: decodeInlineHtml(value), ...style });
    }
  };
  const pushStyledTokens = (value: string, style: Pick<InlineToken & { kind: "text" }, "bold" | "italic">) => {
    for (const token of parseInlineMarkdown(value)) {
      if (token.kind === "math") {
        tokens.push(token);
      } else {
        tokens.push({
          ...token,
          bold: style.bold || token.bold,
          italic: style.italic || token.italic
        });
      }
    }
  };

  while (index < input.length) {
    const rest = input.slice(index);
    const display = rest.match(/^\\\(([\s\S]+?)\\\)/) ?? rest.match(/^\$([^$\n]+?)\$/);
    if (display) {
      tokens.push({ kind: "math", value: display[1] });
      index += display[0].length;
      continue;
    }

    const bold = rest.match(/^\*\*([\s\S]+?)\*\*/);
    if (bold) {
      pushStyledTokens(bold[1], { bold: true });
      index += bold[0].length;
      continue;
    }

    const italic = rest.match(/^\*([^*\n]+?)\*/);
    if (italic) {
      pushStyledTokens(italic[1], { italic: true });
      index += italic[0].length;
      continue;
    }

    const sub = rest.match(/^<sub>([\s\S]+?)<\/sub>/i);
    if (sub) {
      tokens.push({ kind: "math", value: `_{${sub[1]}}` });
      index += sub[0].length;
      continue;
    }

    const sup = rest.match(/^<sup>([\s\S]+?)<\/sup>/i);
    if (sup) {
      tokens.push({ kind: "math", value: `^{${sup[1]}}` });
      index += sup[0].length;
      continue;
    }

    const nextSpecial = findNextInlineSpecial(input, index + 1);
    pushText(input.slice(index, nextSpecial));
    index = nextSpecial;
  }

  return tokens;
}

function findNextInlineSpecial(input: string, start: number): number {
  const candidates = ["\\(", "$", "**", "*", "<sub>", "<sup>"]
    .map((marker) => input.indexOf(marker, start))
    .filter((position) => position >= 0);
  return candidates.length ? Math.min(...candidates) : input.length;
}

function wordRun(text: string, style: { bold?: boolean; italic?: boolean; size?: number }): string {
  if (!text) {
    return "";
  }

  const runProperties = [
    style.bold ? "<w:b/>" : "",
    style.italic ? "<w:i/>" : "",
    style.size ? `<w:sz w:val="${style.size}"/>` : ""
  ].join("");
  return `<w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function latexToOmml(latex: string): string {
  return new LatexParser(latex).parse();
}

class LatexParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): string {
    return this.parseExpression();
  }

  private parseExpression(stopChar = ""): string {
    const nodes: string[] = [];
    while (this.index < this.source.length) {
      if (stopChar && this.peek() === stopChar) {
        this.index += 1;
        break;
      }

      const atom = this.parseAtom();
      nodes.push(this.applyScripts(atom));
    }

    return nodes.join("");
  }

  private parseAtom(): string {
    const char = this.peek();

    if (char === "{") {
      this.index += 1;
      return this.parseExpression("}");
    }

    if (char === "\\") {
      return this.parseCommand();
    }

    if (char === "_" || char === "^") {
      this.index += 1;
      return mathRun(char);
    }

    if (/\s/.test(char)) {
      this.index += 1;
      return mathRun(" ");
    }

    if (/[A-Za-z]/.test(char)) {
      const word = this.takeWhile(/[A-Za-z]/);
      return mathRun(word, /^[A-Z]?[a-z]{2,}$/.test(word) ? "normal" : "italic");
    }

    if (/[0-9.]/.test(char)) {
      return mathRun(this.takeWhile(/[0-9.]/));
    }

    this.index += 1;
    return mathRun(symbolMap[char] ?? char);
  }

  private parseCommand(): string {
    this.index += 1;
    const command = this.takeWhile(/[A-Za-z]/);
    if (!command) {
      const escaped = this.source[this.index] ?? "";
      this.index += escaped ? 1 : 0;
      return mathRun(escaped);
    }

    if (command === "frac") {
      const numerator = this.parseRequiredGroupOrAtom();
      const denominator = this.parseRequiredGroupOrAtom();
      return `<m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num>${numerator}</m:num><m:den>${denominator}</m:den></m:f>`;
    }

    if (command === "sqrt") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${value}</m:e></m:rad>`;
    }

    if (command === "boxed" || command === "fbox") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:borderBox><m:borderBoxPr><m:hideTop m:val="0"/><m:hideBot m:val="0"/><m:hideLeft m:val="0"/><m:hideRight m:val="0"/></m:borderBoxPr><m:e>${value}</m:e></m:borderBox>`;
    }

    if (command === "begin") {
      const environment = this.groupText();
      if (environment === "cases") {
        return this.parseCasesEnvironment();
      }
      if (environment === "aligned" || environment === "gathered" || environment === "matrix" || environment === "pmatrix") {
        return this.parseEquationArrayEnvironment(environment);
      }
      return "";
    }

    if (command === "end") {
      this.discardOptionalGroup();
      return "";
    }

    if (command === "bar" || command === "overline") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${value}</m:e></m:bar>`;
    }

    if (command === "hat" || command === "widehat") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:acc><m:accPr><m:chr m:val="̂"/></m:accPr><m:e>${value}</m:e></m:acc>`;
    }

    if (command === "vec") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${value}</m:e></m:acc>`;
    }

    if (command === "dot") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:acc><m:accPr><m:chr m:val="̇"/></m:accPr><m:e>${value}</m:e></m:acc>`;
    }

    if (command === "ddot") {
      const value = this.parseRequiredGroupOrAtom();
      return `<m:acc><m:accPr><m:chr m:val="̈"/></m:accPr><m:e>${value}</m:e></m:acc>`;
    }

    if (command === "text" || command === "mathrm" || command === "operatorname") {
      return mathRun(this.groupText(), "normal");
    }

    if (command === "hspace") {
      this.discardOptionalGroup();
      return mathRun(" ");
    }

    if (spacingCommandMap[command] !== undefined) {
      return mathRun(spacingCommandMap[command]);
    }

    if (command === "left" || command === "right") {
      return "";
    }

    if (operatorCommandMap[command]) {
      return mathRun(operatorCommandMap[command], "normal");
    }

    return mathRun(symbolCommandMap[command] ?? command, symbolCommandMap[command] ? "normal" : "italic");
  }

  private applyScripts(base: string): string {
    let subscript = "";
    let superscript = "";

    while (this.peek() === "_" || this.peek() === "^") {
      const marker = this.peek();
      this.index += 1;
      const value = this.parseRequiredGroupOrAtom();
      if (marker === "_") {
        subscript = value;
      } else {
        superscript = value;
      }
    }

    if (subscript && superscript) {
      return `<m:sSubSup><m:e>${base}</m:e><m:sub>${subscript}</m:sub><m:sup>${superscript}</m:sup></m:sSubSup>`;
    }

    if (subscript) {
      return `<m:sSub><m:e>${base}</m:e><m:sub>${subscript}</m:sub></m:sSub>`;
    }

    if (superscript) {
      return `<m:sSup><m:e>${base}</m:e><m:sup>${superscript}</m:sup></m:sSup>`;
    }

    return base;
  }

  private parseRequiredGroupOrAtom(): string {
    this.skipSpaces();
    if (this.peek() === "{") {
      this.index += 1;
      return this.parseExpression("}");
    }

    return this.parseAtom();
  }

  private discardOptionalGroup(): void {
    this.skipSpaces();
    if (this.peek() !== "{") {
      return;
    }

    this.index += 1;
    let depth = 1;
    while (this.index < this.source.length && depth > 0) {
      const char = this.source[this.index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      this.index += 1;
    }
  }

  private parseCasesEnvironment(): string {
    const content = this.takeEnvironmentBody("cases");
    const rows = splitEnvironmentRows(content).map((row) => {
      const cells = splitEnvironmentCells(row);
      return cells.map((cell) => new LatexParser(cell.trim()).parse()).join(mathRun("   "));
    }).filter(Boolean);

    return `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/><m:grow m:val="1"/></m:dPr><m:e><m:eqArr>${rows.map((row) => `<m:e>${row}</m:e>`).join("")}</m:eqArr></m:e></m:d>`;
  }

  private parseEquationArrayEnvironment(environment: string): string {
    const content = this.takeEnvironmentBody(environment);
    const rows = splitEnvironmentRows(content).map((row) => {
      const cells = splitEnvironmentCells(row);
      return cells.map((cell) => new LatexParser(cell.trim()).parse()).join(mathRun("   "));
    }).filter(Boolean);
    const array = `<m:eqArr>${rows.map((row) => `<m:e>${row}</m:e>`).join("")}</m:eqArr>`;

    if (environment === "pmatrix") {
      return `<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/><m:grow m:val="1"/></m:dPr><m:e>${array}</m:e></m:d>`;
    }

    return array;
  }

  private takeEnvironmentBody(environment: string): string {
    const endPattern = new RegExp(String.raw`\\end\s*\{\s*${environment}\s*\}`, "g");
    endPattern.lastIndex = this.index;
    const match = endPattern.exec(this.source);
    if (!match) {
      const rest = this.source.slice(this.index);
      this.index = this.source.length;
      return rest;
    }

    const body = this.source.slice(this.index, match.index);
    this.index = match.index + match[0].length;
    return body;
  }

  private groupText(): string {
    this.skipSpaces();
    if (this.peek() !== "{") {
      return "";
    }

    this.index += 1;
    const start = this.index;
    let depth = 1;
    while (this.index < this.source.length && depth > 0) {
      const char = this.source[this.index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      this.index += 1;
    }

    return this.source.slice(start, Math.max(start, this.index - 1));
  }

  private skipSpaces(): void {
    while (/\s/.test(this.peek())) {
      this.index += 1;
    }
  }

  private peek(): string {
    return this.source[this.index] ?? "";
  }

  private takeWhile(pattern: RegExp): string {
    const start = this.index;
    while (this.index < this.source.length && pattern.test(this.source[this.index])) {
      this.index += 1;
    }
    return this.source.slice(start, this.index);
  }
}

function splitEnvironmentRows(content: string): string[] {
  return content
    .split(/\\\\(?:\[[^\]]+\])?/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function splitEnvironmentCells(row: string): string[] {
  return row
    .split(/(?<!\\)&/)
    .map((cell) => cell.replace(/\\&/g, "&").trim())
    .filter(Boolean);
}

function mathRun(text: string, style: "normal" | "italic" = "normal"): string {
  return `<m:r><m:rPr><m:sty m:val="${style === "italic" ? "i" : "p"}"/></m:rPr><m:t xml:space="preserve">${xml(text)}</m:t></m:r>`;
}

const spacingCommandMap: Record<string, string> = {
  ",": " ",
  ":": " ",
  ";": " ",
  " ": " ",
  quad: "  ",
  qquad: "    ",
  thinspace: " ",
  medspace: " ",
  thickspace: " ",
  hspace: " "
};

const operatorCommandMap: Record<string, string> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  log: "log",
  ln: "ln",
  exp: "exp",
  lim: "lim",
  max: "max",
  min: "min",
  arg: "arg",
  det: "det",
  dim: "dim"
};

const symbolCommandMap: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ϵ",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  Delta: "Δ",
  Gamma: "Γ",
  theta: "θ",
  vartheta: "ϑ",
  lambda: "λ",
  Lambda: "Λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  Xi: "Ξ",
  pi: "π",
  Pi: "Π",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  Phi: "Φ",
  chi: "χ",
  psi: "ψ",
  Psi: "Ψ",
  omega: "ω",
  Omega: "Ω",
  sum: "∑",
  prod: "∏",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  partial: "∂",
  nabla: "∇",
  forall: "∀",
  exists: "∃",
  emptyset: "∅",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  approx: "≈",
  sim: "∼",
  simeq: "≃",
  equiv: "≡",
  propto: "∝",
  times: "×",
  cdot: "·",
  div: "÷",
  ast: "∗",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ll: "≪",
  gg: "≫",
  ne: "≠",
  neq: "≠",
  pm: "±",
  mp: "∓",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  degree: "°",
  circ: "∘"
};

const symbolMap: Record<string, string> = {
  "−": "-"
};

function htmlToReadableText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function decodeInlineHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);
    centralEntries.push({
      name: entry.name,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: entry.data.length,
      offset
    });
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralOffset = offset;
  for (const entry of centralEntries) {
    const name = utf8(entry.name);
    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.offset, 42);

    centralParts.push(centralHeader, name);
    offset += centralHeader.length + name.length;
  }

  const centralSize = offset - centralOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }

  return table;
}
