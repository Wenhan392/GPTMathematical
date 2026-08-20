import type { DetectedFeature, DetectionResult } from "../shared/types";

const latexPatterns = [
  /\$\$[\s\S]+?\$\$/,
  /\\\[[\s\S]+?\\\]/,
  /\\\([\s\S]+?\\\)/,
  /(^|[^$])\$[^$\n]+?\$([^$]|$)/,
  /\\(?:frac|sqrt|sum|int|lim|alpha|beta|gamma|theta|pi|cdot|times|left|right|begin|end)\b/
];

const unicodeMathPattern = /[∫∑∏√∞≈≠≤≥±÷×·→⇒⇔↔∂∇∈∉⊂⊆⊄⊇∪∩∀∃∴∵∝°]|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿᵢⱼ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]|[½⅓⅔¼¾⅛⅜⅝⅞]/;
const equationLikePattern = /(?:^|\n)\s*(?:[A-Za-zΑ-ω][A-Za-z0-9Α-ω\s()_,.'-]{0,32})?\s*[A-Za-zΑ-ω0-9)\]]\s*(?:=|≈|≠|≤|≥|<|>)\s*[A-Za-zΑ-ω0-9(\\√∫∑πθλμσ∞+\-*/^_]/m;
const mathWordPattern = /\b(?:equation|formula|solve|simplify|factor|expand|differentiate|derivative|integral|integrate|limit|matrix|vector|probability|variance|standard deviation|quadratic|polynomial|coefficient|function|slope|gradient|theorem|proof)\b/i;

export function detectConvertibleContent(text: string): DetectionResult {
  const normalized = text.trim();
  const features = new Set<DetectedFeature>();

  if (!normalized) {
    return {
      shouldConvert: false,
      features: [],
      confidence: "none",
      reason: "Clipboard is empty."
    };
  }

  if (latexPatterns.some((pattern) => pattern.test(normalized))) {
    features.add("latex");
  }

  if (/^ {0,3}\|.+\|\s*$/m.test(normalized) && /^ {0,3}\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(normalized)) {
    features.add("markdown-table");
  }

  if (/^ {0,3}(?:[-*+]|\d+\.)\s+\S+/m.test(normalized)) {
    features.add("markdown-list");
  }

  if (/^ {0,3}#{1,6}\s+\S+/m.test(normalized)) {
    features.add("markdown-heading");
  }

  if (/```[\s\S]+?```/.test(normalized)) {
    features.add("code-block");
  }

  if (/```mermaid\s+[\s\S]+?```/i.test(normalized)) {
    features.add("mermaid");
  }

  if (/\\ce\{[^}]+\}|(?:H2O|CO2|NaCl|CH4|NH3|H\^?\+|OH\^-|mol\/L|M\b)/.test(normalized)) {
    features.add("chemistry");
  }

  if (/(?:\\vec|\\mathbf|\\hat|\\dot|\\ddot|F\s*=\s*ma|E\s*=\s*mc\^?2|kg\s*m\/s\^?2|N\/m|J\/mol)/.test(normalized)) {
    features.add("physics");
  }

  if (unicodeMathPattern.test(normalized) || equationLikePattern.test(normalized) || hasMultiSignalMathText(normalized)) {
    features.add("math-text");
  }

  const featureList = Array.from(features);
  const strongFeatures = featureList.filter((feature) => feature !== "markdown-list" && feature !== "markdown-heading");
  const shouldConvert = strongFeatures.length > 0 || featureList.length >= 2;

  return {
    shouldConvert,
    features: featureList,
    confidence: shouldConvert ? (strongFeatures.length >= 2 || featureList.length >= 3 ? "high" : "medium") : "low",
    reason: shouldConvert
      ? `Detected ${featureList.join(", ")}.`
      : featureList.length > 0
        ? "Detected light Markdown only; leaving clipboard unchanged."
        : "No math, STEM, or rich Markdown signals detected."
  };
}

function hasMultiSignalMathText(text: string): boolean {
  const operatorCount = (text.match(/[=+\-*/^_<>]/g) ?? []).length;
  const numberCount = (text.match(/\d/g) ?? []).length;
  const hasMathWord = mathWordPattern.test(text);
  const hasGroupedExpression = /[([{][^)\]}]{1,60}[)\]}]/.test(text);

  return hasMathWord && (operatorCount >= 2 || numberCount >= 3 || hasGroupedExpression);
}
