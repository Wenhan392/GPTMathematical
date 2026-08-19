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
