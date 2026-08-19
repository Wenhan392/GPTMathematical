import { describe, expect, it } from "vitest";
import { detectConvertibleContent } from "./detect";

describe("detectConvertibleContent", () => {
  it("detects inline and display LaTeX", () => {
    const result = detectConvertibleContent("Use $x^2 + y^2 = r^2$ and $$\\int_0^1 x dx$$.");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("latex");
  });

  it("detects Markdown tables", () => {
    const result = detectConvertibleContent("| x | f(x) |\n|---|---|\n| 1 | 2 |");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("markdown-table");
  });

  it("detects chemistry notation", () => {
    const result = detectConvertibleContent("The reaction is $\\ce{2H2 + O2 -> 2H2O}$.");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("chemistry");
  });

  it("detects Mermaid code blocks", () => {
    const result = detectConvertibleContent("```mermaid\ngraph TD\nA-->B\n```");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("mermaid");
  });

  it("detects copied rendered math with Unicode symbols", () => {
    const result = detectConvertibleContent("For the expression f(x) = √(x² + 1), the derivative is f′(x) = x / √(x² + 1).");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("math-text");
  });

  it("detects equation-like math copied without LaTeX delimiters", () => {
    const result = detectConvertibleContent("Quadratic formula: x = (-b ± √(b² - 4ac)) / 2a");

    expect(result.shouldConvert).toBe(true);
    expect(result.features).toContain("math-text");
  });

  it("leaves normal prose alone", () => {
    const result = detectConvertibleContent("Please meet me after class tomorrow.");

    expect(result.shouldConvert).toBe(false);
    expect(result.features).toEqual([]);
  });
});
