import { describe, expect, it } from "vitest";
import {
  CHARS_PER_TOKEN,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  estimateTokens,
  normalizeText,
  splitLongText,
} from "./text.js";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("rounds up a partial token", () => {
    expect(estimateTokens("abcde")).toBe(Math.ceil(5 / CHARS_PER_TOKEN));
  });

  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("normalizeText", () => {
  it("collapses runs of spaces/tabs to a single space", () => {
    expect(normalizeText("hello    world\tfoo")).toBe("hello world foo");
  });

  it("unifies CRLF and CR line endings to LF", () => {
    expect(normalizeText("line one\r\nline two\rline three")).toBe(
      "line one\nline two\nline three",
    );
  });

  it("strips trailing whitespace on each line", () => {
    expect(normalizeText("first line   \nsecond line\t\n")).toBe("first line\nsecond line");
  });

  it("collapses 3+ blank lines to exactly one blank line", () => {
    expect(normalizeText("para one\n\n\n\n\npara two")).toBe("para one\n\npara two");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeText("  \n  hello  \n  ")).toBe("hello");
  });

  it("is idempotent", () => {
    const input = "  hello   world  \r\n\r\n\r\n  second\tparagraph  ";
    const once = normalizeText(input);
    expect(normalizeText(once)).toBe(once);
  });

  it("produces the same output for whitespace-only variants of the same prose", () => {
    const a = "Paragraph one.\n\nParagraph two has content.";
    const b = "Paragraph one.   \n\n\n\nParagraph two   has content.  ";
    expect(normalizeText(a)).toBe(normalizeText(b));
  });
});

describe("splitLongText", () => {
  it("returns an empty array for empty input", () => {
    expect(splitLongText("")).toEqual([]);
  });

  it("returns a single chunk when the whole text fits the budget", () => {
    const text = normalizeText("Short paragraph that easily fits in one chunk.");
    const chunks = splitLongText(text, DEFAULT_MAX_TOKENS, DEFAULT_OVERLAP_TOKENS);
    expect(chunks).toEqual([text]);
  });

  it("never emits a chunk exceeding the max token budget", () => {
    // Build a long-prose fixture: many distinct sentences, well past one chunk.
    const sentences = Array.from(
      { length: 80 },
      (_, i) => `This is sentence number ${i} in a long paragraph about career history.`,
    );
    const text = normalizeText(sentences.join(" "));
    const maxTokens = 50;
    const chunks = splitLongText(text, maxTokens, 10);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(maxTokens);
    }
  });

  it("overlaps consecutive chunks by the configured amount", () => {
    const sentences = Array.from(
      { length: 40 },
      (_, i) => `Sentence ${i} describes a distinct fact about the role in enough words.`,
    );
    const text = normalizeText(sentences.join(" "));
    const maxTokens = 40;
    const overlapTokens = 12;
    const chunks = splitLongText(text, maxTokens, overlapTokens);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const previous = chunks[i - 1] as string;
      const current = chunks[i] as string;
      // The current chunk must start with a non-trivial prefix of the
      // previous chunk's tail (the overlap seed) — not just coincidentally
      // share a common word.
      const previousTail = previous.slice(-(overlapTokens * CHARS_PER_TOKEN));
      const overlapWord = previousTail.trim().split(/\s+/).slice(-1)[0];
      expect(overlapWord).toBeDefined();
      expect(current.includes(overlapWord as string)).toBe(true);
      // And the overlap seed must appear at the very start of the next chunk.
      const firstWordOfCurrent = current.split(/\s+/)[0];
      expect(previous.includes(firstWordOfCurrent as string)).toBe(true);
    }
  });

  it("keeps a Markdown bullet list's items intact as separate units", () => {
    const text = normalizeText(
      "Highlights:\n- Did the first thing well.\n- Did the second thing even better.\n- Shipped a third result.",
    );
    const chunks = splitLongText(text, DEFAULT_MAX_TOKENS, DEFAULT_OVERLAP_TOKENS);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("- Did the first thing well.");
    expect(chunks[0]).toContain("- Shipped a third result.");
  });

  it("hard-splits a single unit longer than the max budget", () => {
    const longWord = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitLongText(longWord, 10, 0);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(10);
    }
    const reconstructedWords = chunks.join(" ").split(/\s+/).filter(Boolean);
    expect(reconstructedWords).toEqual(longWord.split(" "));
  });

  it("is deterministic across repeated calls", () => {
    const text = normalizeText(
      "Paragraph one has several sentences. It keeps going for a while. And a bit more.\n\nParagraph two follows after a blank line and also has content worth splitting on.",
    );
    const first = splitLongText(text, 20, 5);
    const second = splitLongText(text, 20, 5);
    expect(second).toEqual(first);
  });
});
