import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { createWordDocumentBuffer, suggestDocxFilename } from "./docxExporter";

describe("docxExporter", () => {
  it("creates native Word equations for fractions, subscripts, and superscripts", () => {
    const buffer = createWordDocumentBuffer({
      title: "Question 4: Reynolds / Flow",
      html: "",
      plainText: [
        "# For Question 4 specifically",
        "",
        "- Flow rate is \\(Q = 75\\text{ L/s} = 0.075\\text{ m}^3/\\text{s}\\)",
        "",
        "\\[",
        "A_1 = \\frac{\\pi D_1^2}{4}",
        "\\]",
        "",
        "\\[",
        "Re_1 = \\frac{\\rho \\bar U_1 D_1}{\\mu} \\approx 2.44 \\times 10^5",
        "\\]",
        "",
        "| Quantity | Value |",
        "| --- | --- |",
        "| \\(D_1\\) | \\(0.25\\text{ m}\\) |"
      ].join("\n")
    });

    expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
    expect(buffer.includes(Buffer.from("word/document.xml"))).toBe(true);

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).toContain("<m:bar>");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("• ");
    expect(documentXml).toContain("π");
    expect(documentXml).toContain("ρ");
    expect(documentXml).toContain("μ");
    expect(documentXml).toContain("≈");
  });

  it("suggests safe docx filenames", () => {
    expect(suggestDocxFilename("Question 4: Reynolds / Flow")).toBe("Question 4 Reynolds Flow.docx");
  });

  it("maps common LaTeX commands to symbols instead of leaking command words", () => {
    const buffer = createWordDocumentBuffer({
      title: "Symbols",
      html: "",
      plainText: [
        "\\[",
        "PV = nRT, \\qquad \\dot m = \\rho Q = \\rho A \\bar U",
        "\\]",
        "",
        "\\[",
        "\\Delta H_{system} = \\Delta z + \\sum f \\frac{L}{D}\\frac{\\bar U^2}{2g} + \\epsilon",
        "\\]"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("∑");
    expect(documentXml).toContain("ϵ");
    expect(documentXml).toContain("Δ");
    expect(documentXml).toContain("<m:acc>");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).not.toContain(">sum<");
    expect(documentXml).not.toContain(">epsilon<");
    expect(documentXml).not.toContain(">qquad<");
  });

  it("exports boxed expressions and cases environments without leaking command words", () => {
    const buffer = createWordDocumentBuffer({
      title: "Cases",
      html: "",
      plainText: [
        "\\[",
        "\\boxed{x = \\begin{cases} a^2 & \\text{if } a > 0 \\\\ b_1 & \\text{otherwise} \\end{cases}}",
        "\\]",
        "",
        "$$",
        "\\boxed{q = \\begin{bmatrix} \\phi\\\\ r\\\\ x \\end{bmatrix}}",
        "$$"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("<m:borderBox>");
    expect(documentXml).toContain("<m:d>");
    expect(documentXml).toContain("<m:eqArr>");
    expect(documentXml).toContain("<m:m>");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).not.toContain(">boxed<");
    expect(documentXml).not.toContain(">begin<");
    expect(documentXml).not.toContain(">cases<");
    expect(documentXml).not.toContain(">bmatrix<");
    expect(documentXml).not.toContain(">end<");
    expect(documentXml).not.toContain("$$");
  });

  it("exports matrix-heavy linear algebra equations without leaking dfrac or mathbf words", () => {
    const buffer = createWordDocumentBuffer({
      title: "Linear algebra",
      html: "",
      plainText: [
        "\\[",
        "\\mathbf{A}\\mathbf{x} = \\mathbf{b}",
        "\\]",
        "",
        "\\[",
        "\\mathbf{A} = \\begin{bmatrix}",
        "\\dfrac{3}{2} & -\\dfrac{7}{4} & \\sqrt{2} \\\\",
        "\\dfrac{5}{3} & \\dfrac{11}{6} & -\\dfrac{\\pi}{4} \\\\",
        "-\\sqrt{3} & \\dfrac{2}{5} & \\dfrac{9}{7}",
        "\\end{bmatrix},\\quad",
        "\\mathbf{x}=\\begin{bmatrix}x_1\\\\x_2\\\\x_3\\end{bmatrix}",
        "\\]",
        "",
        "\\[",
        "\\det(\\mathbf{A}) = \\begin{vmatrix}",
        "\\dfrac{3}{2} & -\\dfrac{7}{4} & \\sqrt{2} \\\\",
        "\\dfrac{5}{3} & \\dfrac{11}{6} & -\\dfrac{\\pi}{4} \\\\",
        "-\\sqrt{3} & \\dfrac{2}{5} & \\dfrac{9}{7}",
        "\\end{vmatrix}",
        "\\]"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("<m:rad>");
    expect(documentXml).toContain("<m:d>");
    expect(documentXml).toContain("<m:m>");
    expect(documentXml).toContain("<m:mr>");
    expect(documentXml).toContain('m:val="bi"');
    expect(documentXml).toContain('m:begChr m:val="["');
    expect(documentXml).toContain('m:begChr m:val="|"');
    const visibleText = xmlVisibleText(documentXml);
    expect(visibleText).not.toContain("dfrac");
    expect(visibleText).not.toContain("mathbf");
    expect(visibleText).not.toContain("begin");
    expect(visibleText).not.toContain("vmatrix");
    expect(visibleText).not.toContain("end");
  });

  it("exports nested fractions and block matrices without leaking style commands", () => {
    const buffer = createWordDocumentBuffer({
      title: "Stress test",
      html: "",
      plainText: [
        "A more complicated expression for testing nested fractions is",
        "",
        "\\[",
        "\\mathcal{F}(\\alpha,\\beta)=",
        "\\frac{\\displaystyle\\sum_{i=1}^{n}\\left[",
        "\\frac{\\alpha_i^2 + \\sqrt{\\beta_i^2 + 4\\alpha_i\\beta_i}}{1 + \\frac{\\alpha_i}{\\beta_i + \\frac{1}{1+\\alpha_i^2}}}",
        "\\right]}{\\displaystyle\\prod_{j=1}^{m}\\left(1 + \\frac{e^{-j\\lambda}}{j^2 + \\omega^2}\\right)}",
        "\\]",
        "",
        "And a block matrix stress test:",
        "",
        "\\[",
        "\\begin{bmatrix}",
        "\\mathbf{A} & \\mathbf{B}^T & \\mathbf{0} \\\\[6pt]",
        "\\mathbf{B} & -\\lambda\\mathbf{I} & \\mathbf{C} \\\\[8pt]",
        "\\mathbf{0} & \\mathbf{C}^T & \\dfrac{\\partial^2\\Phi}{\\partial q_i\\partial q_j}",
        "\\end{bmatrix}",
        "\\begin{bmatrix}\\Delta\\mathbf{x}\\\\[6pt] \\Delta\\boldsymbol{\\lambda}\\\\[10pt] \\Delta\\mathbf{q}\\end{bmatrix}",
        "= -\\begin{bmatrix}\\nabla_{\\mathbf{x}}\\mathcal{L}\\\\ \\mathbf{g}(\\mathbf{x})\\\\ \\nabla_{\\mathbf{q}}\\Phi\\end{bmatrix}.",
        "\\]",
        "",
        "\\[",
        "mathcalF(\\alpha,\\beta)=\\frac{displaystyle\\sum_{i=1}^{n}\\left[\\frac{\\alpha_i}{1+\\alpha_i^2}\\right]}{displaystyle\\prod_{j=1}^{m}\\left(1+\\frac{1}{j^2+\\omega^2}\\right)}",
        "\\]",
        "",
        "\\[",
        "\\begin{bmatrix}\\Delta mathbf x\\\\[6pt] \\Delta boldsymbol\\lambda\\\\[8pt] \\Delta mathbf q\\end{bmatrix}=\\begin{bmatrix}\\nabla_{mathbfx}mathcalL\\\\ mathbf g(mathbfx)\\\\ \\nabla_{mathbfq}\\Phi\\end{bmatrix}",
        "\\]"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("ℱ");
    expect(documentXml).toContain("ℒ");
    expect(documentXml).toContain("∑");
    expect(documentXml).toContain("∏");
    expect(documentXml).toContain("∂");
    expect(documentXml).toContain("∇");
    expect(documentXml).toContain("λ");
    expect(documentXml).toContain("ω");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("<m:rad>");
    expect(documentXml).toContain("<m:sSubSup>");
    expect(documentXml).toContain("<m:d>");
    expect(documentXml).toContain("<m:m>");
    expect(documentXml).toContain("<m:mr>");
    expect(documentXml).toContain('m:begChr m:val="["');
    expect(documentXml).toContain('m:begChr m:val="("');
    const visibleText = xmlVisibleText(documentXml);
    expect(visibleText).not.toContain("displaystyle");
    expect(visibleText).not.toContain("mathcal");
    expect(visibleText).not.toContain("mathbf");
    expect(visibleText).not.toContain("boldsymbol");
    expect(visibleText).not.toContain("dfrac");
    expect(visibleText).not.toContain("left");
    expect(visibleText).not.toContain("right");
    expect(visibleText).not.toContain("[6pt]");
    expect(visibleText).not.toContain("[8pt]");
    expect(visibleText).not.toContain("[10pt]");
  });

  it("keeps compact fractions inside matrices as vertical fractions with denominators", () => {
    const buffer = createWordDocumentBuffer({
      title: "Compact matrix fractions",
      html: "",
      plainText: [
        "The matrix product is",
        "",
        "\\[",
        "\\begin{bmatrix}",
        "0 & -\\frac74 & \\sqrt2 \\\\",
        "\\frac53 & 0 & -\\frac\\pi4 \\\\",
        "-\\sqrt3 & \\frac25 & 0",
        "\\end{bmatrix}",
        "\\begin{bmatrix}1\\\\-\\frac12\\\\\\frac34\\end{bmatrix}",
        "=",
        "\\begin{bmatrix}\\frac78 + \\frac{3\\sqrt2}{4}\\\\\\frac53-\\frac{3\\pi}{16}\\\\-\\sqrt3-\\frac15\\end{bmatrix}",
        "\\]",
        "",
        "Thus",
        "",
        "\\[",
        "x^{(1)} = \\begin{bmatrix}",
        "\\frac23\\left(\\frac54-\\frac{3\\sqrt2}{4}\\right) \\\\",
        "\\frac6{11}\\left(-\\frac{64}{15}+\\frac{3\\pi}{16}\\right) \\\\",
        "\\frac79\\left(\\frac{109}{20}+\\sqrt3\\right)",
        "\\end{bmatrix}.",
        "\\]"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("<m:m>");
    expect(documentXml).toContain("<m:mr>");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("<m:den><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t xml:space=\"preserve\">4</m:t></m:r></m:den>");
    expect(documentXml).toContain("<m:den><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t xml:space=\"preserve\">3</m:t></m:r></m:den>");
    expect(documentXml).toContain("<m:den><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t xml:space=\"preserve\">5</m:t></m:r></m:den>");
    expect(documentXml).not.toContain("<m:den></m:den>");
    const visibleText = xmlVisibleText(documentXml);
    expect(visibleText).not.toContain("[6pt]");
    expect(visibleText).not.toContain("[8pt]");
    expect(visibleText).not.toContain("[10pt]");
  });

  it("exports inline math inside bold text as equations", () => {
    const buffer = createWordDocumentBuffer({
      title: "Angular momentum",
      html: "",
      plainText: "Great question. The reason is that **\\(L = \\omega\\) and \\(L = mrv\\)** are the same equation."
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("<m:oMath>");
    expect(documentXml).toContain("ω");
    expect(documentXml).toContain("mrv");
    expect(documentXml).not.toContain("\\(");
    expect(documentXml).not.toContain("\\omega");
    expect(documentXml).not.toContain("\\)");
  });

  it("formats imported chat turns with readable title, section headers, separators, and tables", () => {
    const buffer = createWordDocumentBuffer({
      title: "Fluid mechanics chat",
      html: "",
      plainText: [
        "## User request 1",
        "",
        "Please solve question 4.",
        "",
        "---",
        "",
        "## GPT response 1",
        "",
        "Use \\(Re_1\\) and summarize the result:",
        "",
        "| Item | Value |",
        "| --- | --- |",
        "| Result | Turbulent |"
      ].join("\n")
    });

    const documentXml = readZipEntry(buffer, "word/document.xml");
    expect(documentXml).toContain("Fluid mechanics chat");
    expect(documentXml).toContain("User request 1");
    expect(documentXml).toContain("GPT response 1");
    expect(documentXml).toContain('w:fill="EFF6FF"');
    expect(documentXml).toContain('w:fill="F0FDF4"');
    expect(documentXml).toContain('w:color="E2E8F0"');
    expect(documentXml).toContain('w:fill="F1F5F9"');
    expect(documentXml).toContain("<w:tbl>");
  });
});

function readZipEntry(buffer: Buffer, entryName: string): string {
  let offset = 0;
  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const dataStart = fileNameStart + fileNameLength + extraLength;
    const fileName = buffer.subarray(fileNameStart, fileNameStart + fileNameLength).toString("utf8");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (fileName === entryName) {
      return compressionMethod === 8
        ? zlib.inflateRawSync(compressed).toString("utf8")
        : compressed.toString("utf8");
    }

    offset = dataStart + compressedSize;
  }

  throw new Error(`Missing ZIP entry: ${entryName}`);
}

function xmlVisibleText(xml: string): string {
  return xml.replace(/<[^>]+>/g, "");
}
