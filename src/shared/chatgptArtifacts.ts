const citationBoundary = "[\\uE000-\\uF8FF\\uFFFD]";
const citationReference = "turn\\d+[A-Za-z]+\\d+";

const chatGptCitationPattern = new RegExp(
  `${citationBoundary}+\\s*(?:filecite|cite|source)\\s*(?:${citationBoundary}+\\s*${citationReference}\\s*)+${citationBoundary}*`,
  "gi"
);

export function stripChatGptArtifacts(text: string): string {
  return text
    .replace(chatGptCitationPattern, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
}
