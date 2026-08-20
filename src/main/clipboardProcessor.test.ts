import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../shared/types";
import { ClipboardProcessor, type ClipboardPort } from "./clipboardProcessor";

function makeProcessor(initialText: string, enabled = true) {
  let text = initialText;
  let html = "";
  const writes: Array<{ text: string; html: string }> = [];
  const notify = vi.fn();
  const preview = vi.fn();
  const clipboardPort: ClipboardPort = {
    readText: () => text,
    readHTML: () => html,
    write: (data) => {
      writes.push(data);
      text = data.text;
      html = data.html;
    }
  };
  const processor = new ClipboardProcessor({
    clipboardPort,
    getSettings: () => ({ ...defaultSettings, enabled }),
    notify,
    preview,
    now: () => 1
  });

  return { processor, writes, notify, preview, getHtml: () => html };
}

describe("ClipboardProcessor", () => {
  it("converts eligible clipboard content once", async () => {
    const { processor, writes, notify, preview, getHtml } = makeProcessor("Solve $x^2 = 4$.");

    const first = await processor.poll();
    const second = await processor.poll();

    expect(first.converted).toBe(true);
    expect(second.converted).toBe(false);
    expect(writes).toHaveLength(1);
    expect(getHtml()).toContain("katex");
    expect(notify).toHaveBeenCalledWith("Formatted clipboard is ready.", "success");
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      title: "Clipboard converted",
      html: expect.stringContaining("katex")
    }));
  });

  it("does not convert ordinary text", async () => {
    const { processor, writes, preview } = makeProcessor("hello there");

    const result = await processor.poll();

    expect(result.converted).toBe(false);
    expect(writes).toHaveLength(0);
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      title: "Clipboard copied",
      html: expect.stringContaining("hello there"),
      plainText: "hello there"
    }));
  });

  it("respects disabled auto-fix mode", async () => {
    const { processor, writes, preview } = makeProcessor("Solve $x^2 = 4$.", false);

    const result = await processor.poll();

    expect(result.converted).toBe(false);
    expect(result.reason).toBe("Auto-fix is disabled.");
    expect(writes).toHaveLength(0);
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      status: "Auto-fix is disabled; showing copied content for debugging."
    }));
  });

  it("prefers rich HTML over mangled plain text", async () => {
    let text = "A\n1\n=\nπD\n1\n2\n/4";
    let html = "<p>At the entry, <math><msub><mi>D</mi><mn>1</mn></msub><mo>=</mo><mn>250</mn></math>.</p>";
    const writes: Array<{ text: string; html: string }> = [];
    const preview = vi.fn();
    const processor = new ClipboardProcessor({
      clipboardPort: {
        readText: () => text,
        readHTML: () => html,
        write: (data) => {
          writes.push(data);
          text = data.text;
          html = data.html;
        }
      },
      getSettings: () => defaultSettings,
      notify: vi.fn(),
      preview,
      now: () => 1
    });

    const result = await processor.poll();

    expect(result.converted).toBe(true);
    expect(writes[0].html).toContain("<math>");
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("<math>")
    }));
  });
});
