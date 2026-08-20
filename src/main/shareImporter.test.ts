import { describe, expect, it } from "vitest";
import { chooseBestMarkdownCandidate, sharePayloadToMarkdown } from "./shareImporter";

describe("chooseBestMarkdownCandidate", () => {
  it("rejects ChatGPT feature-gate bootstrap JSON in favor of conversation content", () => {
    const bootstrapJson = JSON.stringify({
      feature_gates: {
        "3586701880": {
          name: "3586701880",
          rule_id: "example",
          secondary_exposures: [{ gate: "2064454456", gateValue: "false", ruleID: "default" }],
          value: false
        }
      },
      statsigEnvironment: { tier: "production" },
      sdkInfo: { sdkType: "statsig-server-core-node" },
      evaluated_keys: { customIDs: { shared_conversation_id: "abc" } }
    }).repeat(120);

    const conversation = [
      "At the entry, $D_1 = 250\\text{ mm}=0.25\\text{ m}$.",
      "",
      "$$A_1 = \\frac{\\pi D_1^2}{4}$$",
      "",
      "$$Re_1 = \\frac{\\rho U_1 D_1}{\\mu} \\approx 2.44 \\times 10^5$$"
    ].join("\n");

    expect(chooseBestMarkdownCandidate([bootstrapJson, conversation])).toBe(conversation);
  });

  it("prefers recovered LaTeX over longer flattened math text", () => {
    const flattened = [
      "# For Question 4 specifically",
      "At the entry, D1=250 mm=0.25 m.",
      "A1=4πD12",
      "U¯1=A1Q",
      "Re1=μρU¯1D1",
      "Re1=0.00181150(1.53)(0.25)≈2.44×105"
    ].join("\n");
    const recovered = [
      "# For Question 4 specifically",
      "",
      "At the **entry**, $D_1 = 250\\text{ mm} = 0.25\\text{ m}$.",
      "",
      "$$A_1 = \\frac{\\pi D_1^2}{4}$$",
      "",
      "$$\\bar{U}_1 = \\frac{Q}{A_1}$$",
      "",
      "$$Re_1 = \\frac{\\rho \\bar{U}_1 D_1}{\\mu} \\approx 2.44 \\times 10^5$$"
    ].join("\n");

    expect(chooseBestMarkdownCandidate([flattened, recovered])).toBe(recovered);
  });
});

describe("sharePayloadToMarkdown", () => {
  it("extracts clean Markdown and LaTeX from ChatGPT shared conversation payloads", () => {
    const payload = {
      title: "Reynolds number solution",
      linear_conversation: [
        {
          message: {
            author: { role: "user" },
            content: { parts: ["Solve question 4."] }
          }
        },
        {
          message: {
            author: { role: "assistant" },
            content: {
              parts: [
                [
                  "At the **entry**, \\(D_1 = 250\\text{ mm}=0.25\\text{ m}\\).",
                  "",
                  "\\[",
                  "A_1 = \\frac{\\pi D_1^2}{4}",
                  "\\]",
                  "",
                  "\\[",
                  "Re_1 = \\frac{\\rho \\bar U_1 D_1}{\\mu} \\approx 2.44 \\times 10^5",
                  "\\]"
                ].join("\n")
              ]
            }
          }
        }
      ]
    };

    const result = sharePayloadToMarkdown(payload);

    expect(result?.title).toBe("Reynolds number solution");
    expect(result?.markdown).toContain("## User request 1");
    expect(result?.markdown).toContain("## GPT response 1");
    expect(result?.markdown).toContain("\\frac{\\pi D_1^2}{4}");
    expect(result?.markdown).toContain("Re_1");
    expect(result?.markdown).toContain("\\times 10^5");
  });

  it("skips hidden and system messages when importing share JSON", () => {
    const payload = {
      linear_conversation: [
        {
          message: {
            author: { role: "system" },
            content: { parts: ["Do not include me."] }
          }
        },
        {
          message: {
            author: { role: "assistant" },
            metadata: { is_visually_hidden_from_conversation: true },
            content: { parts: ["Hidden draft."] }
          }
        },
        {
          message: {
            author: { role: "assistant" },
            content: { parts: ["Visible answer with \\(x_1^2\\)."] }
          }
        }
      ]
    };

    expect(sharePayloadToMarkdown(payload)?.markdown).toBe("## GPT response 1\n\nVisible answer with \\(x_1^2\\).");
  });

  it("can select one assistant response instead of exporting the whole chat", () => {
    const payload = {
      linear_conversation: [
        {
          message: {
            id: "user-1",
            author: { role: "user" },
            content: { parts: ["Question"] }
          }
        },
        {
          message: {
            id: "assistant-1",
            author: { role: "assistant" },
            content: { parts: ["First answer with \\(x_1\\)."] }
          }
        },
        {
          message: {
            id: "assistant-2",
            author: { role: "assistant" },
            content: { parts: ["Second answer with \\(x_2\\)."] }
          }
        }
      ]
    };

    const result = sharePayloadToMarkdown(payload, "assistant-2");

    expect(result?.selectedResponseId).toBe("assistant-2");
    expect(result?.responseOptions.map((option) => option.id)).toEqual(["all", "assistant-1", "assistant-2"]);
    expect(result?.markdown).toBe("## GPT response 2\n\nSecond answer with \\(x_2\\).");
  });

  it("skips oversized whole-chat Markdown while preserving selectable responses", () => {
    const largeAnswer = "Large answer paragraph. ".repeat(120);
    const payload = {
      linear_conversation: [
        {
          message: {
            id: "user-1",
            author: { role: "user" },
            content: { parts: ["Question"] }
          }
        },
        {
          message: {
            id: "assistant-1",
            author: { role: "assistant" },
            content: { parts: [largeAnswer] }
          }
        },
        {
          message: {
            id: "assistant-2",
            author: { role: "assistant" },
            content: { parts: ["Small answer with \\(x_2\\)."] }
          }
        }
      ]
    };

    const wholeChat = sharePayloadToMarkdown(payload, "all", 300);
    const selected = sharePayloadToMarkdown(payload, "assistant-2", 300);

    expect(wholeChat?.oversized?.scope).toBe("whole chat");
    expect(wholeChat?.markdown).toBe("");
    expect(wholeChat?.responseOptions.map((option) => option.id)).toEqual(["all", "assistant-1", "assistant-2"]);
    expect(selected?.oversized).toBeUndefined();
    expect(selected?.markdown).toBe("## GPT response 2\n\nSmall answer with \\(x_2\\).");
  });

  it("removes ChatGPT file citation markers from imported messages", () => {
    const payload = {
      linear_conversation: [
        {
          message: {
            author: { role: "assistant" },
            content: {
              parts: [
                [
                  "It includes the question paper and formula sheet. \uE200filecite\uE202turn0file0\uE201",
                  "The second marker should go too. \uFFFDfilecite\uFFFDturn0File1\uFFFD"
                ].join("\n")
              ]
            }
          }
        }
      ]
    };

    const result = sharePayloadToMarkdown(payload);

    expect(result?.markdown).toContain("It includes the question paper and formula sheet.");
    expect(result?.markdown).toContain("The second marker should go too.");
    expect(result?.markdown).not.toContain("filecite");
    expect(result?.markdown).not.toContain("turn0file0");
    expect(result?.markdown).not.toContain("turn0File1");
  });
});
