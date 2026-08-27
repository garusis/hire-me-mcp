import { describe, expect, it } from "vitest";
import type { CitedSegment } from "./chat-citation-sources";
import { buildChatBlocks, parseInlineMarkdown } from "./chat-markdown";

function text(value: string): CitedSegment {
  return { kind: "text", text: value };
}

const CITATION: CitedSegment = {
  kind: "citation",
  offset: 0,
  source: { index: 1, marker: "[cite:project:cowork]", href: "/projects/cowork", label: "Cowork" },
};

describe("parseInlineMarkdown", () => {
  it("returns a single text node for prose with no syntax", () => {
    expect(parseInlineMarkdown("just prose")).toEqual([{ kind: "text", text: "just prose" }]);
  });

  it("parses bold, italic and inline code", () => {
    expect(parseInlineMarkdown("a **b** c *d* e `f`")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " c " },
      { kind: "emphasis", children: [{ kind: "text", text: "d" }] },
      { kind: "text", text: " e " },
      { kind: "code", text: "f" },
    ]);
  });

  it("prefers bold over italic for a doubled marker", () => {
    expect(parseInlineMarkdown("**Company**")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "Company" }] },
    ]);
  });

  it("leaves a lone asterisk alone rather than opening a span it can never close", () => {
    expect(parseInlineMarkdown("3 * 4 = 12")).toEqual([{ kind: "text", text: "3 * 4 = 12" }]);
  });

  it("leaves underscores in identifiers alone — they are not emphasis here", () => {
    expect(parseInlineMarkdown("the snake_case_id column")).toEqual([
      { kind: "text", text: "the snake_case_id column" },
    ]);
  });

  it("does not treat HTML as markup — it is text going in and text coming out", () => {
    expect(parseInlineMarkdown("<script>alert(1)</script>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("does not parse link or image syntax, so an answer can never supply a URL", () => {
    expect(parseInlineMarkdown("[x](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[x](javascript:alert(1))" },
    ]);
  });
});

describe("buildChatBlocks", () => {
  it("wraps plain prose in one paragraph", () => {
    expect(buildChatBlocks([text("Just prose.")])).toEqual([
      { kind: "paragraph", children: [{ kind: "text", text: "Just prose." }] },
    ]);
  });

  it("returns nothing for an empty answer, so a streaming bubble starts clean", () => {
    expect(buildChatBlocks([])).toEqual([]);
    expect(buildChatBlocks([text("")])).toEqual([]);
  });

  it("turns `*` and `-` lines into one unordered list — issue 272's career walkthrough", () => {
    const blocks = buildChatBlocks([text("* First role\n* Second role\n- Third role")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[0]?.kind === "list" && blocks[0].items).toHaveLength(3);
  });

  it("turns `1.` lines into an ordered list", () => {
    const blocks = buildChatBlocks([text("1. First\n2) Second")]);
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: true });
  });

  it("does not mix an ordered and an unordered list into one block", () => {
    const blocks = buildChatBlocks([text("- a\n1. b")]);
    expect(blocks.map((block) => block.kind === "list" && block.ordered)).toEqual([false, true]);
  });

  it("strips the list marker from the item's own text", () => {
    const blocks = buildChatBlocks([text("* **House Numbers**: built it")]);
    expect(blocks[0]?.kind === "list" && blocks[0].items[0]).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "House Numbers" }] },
      { kind: "text", text: ": built it" },
    ]);
  });

  it("splits paragraphs on a blank line and keeps soft breaks inside one", () => {
    expect(buildChatBlocks([text("One.\nStill one.\n\nTwo.")])).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "One." },
          { kind: "text", text: "\n" },
          { kind: "text", text: "Still one." },
        ],
      },
      { kind: "paragraph", children: [{ kind: "text", text: "Two." }] },
    ]);
  });

  it("keeps a citation reference intact inside a paragraph", () => {
    expect(buildChatBlocks([text("He built it "), CITATION, text(".")])).toEqual([
      {
        kind: "paragraph",
        children: [{ kind: "text", text: "He built it " }, CITATION, { kind: "text", text: "." }],
      },
    ]);
  });

  it("keeps a citation reference intact inside a list item", () => {
    const blocks = buildChatBlocks([text("* Built it "), CITATION, text(".")]);
    expect(blocks[0]?.kind === "list" && blocks[0].items[0]).toEqual([
      { kind: "text", text: "Built it " },
      CITATION,
      { kind: "text", text: "." },
    ]);
  });

  it("carries an unresolved-marker segment through untouched (issue 270's DOM trace)", () => {
    const unresolved: CitedSegment = {
      kind: "unresolved",
      marker: "[cite:get-skill-evidence:rust]",
      offset: 3,
    };
    expect(buildChatBlocks([text("No."), unresolved])).toEqual([
      { kind: "paragraph", children: [{ kind: "text", text: "No." }, unresolved] },
    ]);
  });

  it("does not treat a line that only holds a reference as blank", () => {
    const blocks = buildChatBlocks([text("\n"), CITATION]);
    expect(blocks).toEqual([{ kind: "paragraph", children: [CITATION] }]);
  });
});
