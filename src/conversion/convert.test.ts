import { describe, expect, it } from "vitest";
import { defaultSettings } from "../shared/types";
import { convertToRichHtml } from "./convert";

describe("convertToRichHtml", () => {
  it("converts representative ChatGPT math output", () => {
    const result = convertToRichHtml(
      [
        "# Quadratic formula",
        "",
        "For $ax^2 + bx + c = 0$, the roots are:",
        "",
        "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
        "",
        "| Symbol | Meaning |",
        "|---|---|",
        "| $a$ | quadratic coefficient |"
      ].join("\n"),
      defaultSettings,
      { includeCss: false }
    );

    expect(result.html).toMatchSnapshot();
    expect(result.plainText).toContain("Quadratic formula");
    expect(result.warnings).toEqual([]);
  });

  it("preserves Mermaid source as a formatted diagram card", () => {
    const result = convertToRichHtml("```mermaid\ngraph TD\nA-->B\n```", defaultSettings, { includeCss: false });

    expect(result.html).toContain('aria-label="Mermaid diagram"');
    expect(result.html).toContain('marker-end="url(#arrow)"');
    expect(result.html).toContain("language-mermaid");
  });

  it("renders Markdown tables as HTML tables", () => {
    const result = convertToRichHtml(
      [
        "| Quantity | Value |",
        "| --- | --- |",
        "| $D_1$ | $0.25\\text{ m}$ |",
        "| $Re_1$ | $2.44 \\times 10^5$ |"
      ].join("\n"),
      defaultSettings,
      { includeCss: false }
    );

    expect(result.html).toContain("<table>");
    expect(result.html).toContain("<th>Quantity</th>");
    expect(result.html).toContain("gptmath-math-inline");
  });

  it("preserves safe subscript, superscript, and bullet list HTML", () => {
    const result = convertToRichHtml(
      [
        "- Flow rate is 75 L/s = 0.075 m<sup>3</sup>/s",
        "- Exit diameter is D<sub>2</sub> = 0.20 m"
      ].join("\n"),
      defaultSettings,
      { includeCss: false }
    );

    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("<li>Flow rate is 75 L/s = 0.075 m<sup>3</sup>/s</li>");
    expect(result.html).toContain("D<sub>2</sub>");
  });
});
