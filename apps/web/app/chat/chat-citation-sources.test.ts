import { readFileSync } from "node:fs";
import path from "node:path";
import * as citationsModule from "@hire-me-mcp/agent/citations";
import { describe, expect, it } from "vitest";
import type { StoryParentRef, WritingEntry } from "../../src/lib/content";
import { buildCitedAnswer } from "./chat-citation-sources";

const SOURCE_PATH = path.join(process.cwd(), "app", "chat", "chat-citation-sources.ts");

const NO_WRITING: readonly WritingEntry[] = [];
const NO_STORY_PARENTS: readonly StoryParentRef[] = [];

function textOf(text: string, writingEntries: readonly WritingEntry[] = NO_WRITING): string {
  return buildCitedAnswer(text, writingEntries, NO_STORY_PARENTS)
    .segments.filter((segment) => segment.kind === "text")
    .map((segment) => segment.text)
    .join("");
}

describe("buildCitedAnswer", () => {
  it("imports the shared parser from @hire-me-mcp/agent/citations rather than re-implementing the marker format", () => {
    // Guards against a regex-guessed reimplementation of the `[cite:...]`
    // format (issue #70's explicit requirement): asserts the real,
    // unmocked module actually exports the functions this module must
    // import and use. The `/citations` subpath (not the package's default
    // `.` export) is deliberate: the default export barrel re-exports the
    // full embedded Mastra agent runtime (Node-only — `@mastra/core`,
    // model providers), which fails a Next.js client-component build if
    // reached from the client-rendered chat surface; `citations.ts` itself
    // is framework-free and hermetic (see its own module doc), so the
    // package exposes it as its own subpath for exactly this kind of
    // client-safe reuse.
    expect(typeof citationsModule.parseCitations).toBe("function");
    expect(typeof citationsModule.parseCitationSpans).toBe("function");
    expect(typeof citationsModule.serializeCitation).toBe("function");

    const source = readFileSync(SOURCE_PATH, "utf-8");
    expect(source).toMatch(/from\s+"@hire-me-mcp\/agent\/citations"/);
    expect(source).toContain("parseCitationSpans");
    // No regex of its own — the marker's shape is defined in exactly one place.
    expect(source).not.toMatch(/\\\[cite:/);
  });

  it("returns plain text untouched, with no sources, when there are no markers", () => {
    const answer = buildCitedAnswer("Just plain prose.", NO_WRITING);
    expect(answer.segments).toEqual([{ kind: "text", text: "Just plain prose." }]);
    expect(answer.sources).toEqual([]);
  });

  it("numbers citations from one in order of first appearance", () => {
    const { sources } = buildCitedAnswer(
      "He built it. [cite:experience:house-numbers] He also shipped [cite:project:cowork]",
      NO_WRITING,
    );
    expect(sources.map((source) => source.index)).toEqual([1, 2]);
    expect(sources.map((source) => source.href)).toEqual([
      "/experience#house-numbers",
      "/projects/cowork",
    ]);
  });

  it("gives two markers pointing at the same record one shared number, so the source list lists sources and not mentions", () => {
    const { sources, segments } = buildCitedAnswer(
      "First claim [cite:project:cowork] and second claim [cite:project:cowork]",
      NO_WRITING,
    );
    expect(sources).toHaveLength(1);
    const citations = segments.filter((segment) => segment.kind === "citation");
    expect(citations).toHaveLength(2);
    expect(citations.map((segment) => segment.source.index)).toEqual([1, 1]);
  });

  // Issue 227's visible defect: the marker was deleted from the sentence and
  // the space in front of it was left behind, so real answers read
  // "…open to new opportunities ." mid-paragraph.
  it("leaves no stray space where a marker was, so a cited sentence's full stop stays attached", () => {
    expect(textOf("Marcos is open to new opportunities [cite:profile:marcos-alvarez].")).toBe(
      "Marcos is open to new opportunities.",
    );
  });

  // Issue 270: the model wrote `[cite:get-skill-evidence:rust]` — a TOOL's
  // name where an entity type belongs. That is not a citable marker, so it
  // used to be treated as prose and printed to the reader verbatim.
  it("never shows a tool-name-shaped marker to the reader", () => {
    const answer =
      "He doesn't have production Rust experience [cite:get-skill-evidence:rust]; the closest " +
      "evidence is TypeScript [cite:skill:typescript].";
    const prose = textOf(answer);

    expect(prose).not.toContain("[cite:");
    expect(prose).not.toContain("get-skill-evidence");
    expect(prose).toBe(
      "He doesn't have production Rust experience; the closest evidence is TypeScript.",
    );
  });

  it("keeps an unresolvable marker in the DOM as an `unresolved` segment rather than deleting it silently", () => {
    const { segments, sources } = buildCitedAnswer(
      "He hasn't used it [cite:get-skill-evidence:rust].",
      NO_WRITING,
    );

    expect(segments).toContainEqual({
      kind: "unresolved",
      marker: "[cite:get-skill-evidence:rust]",
      offset: 18,
    });
    // Machine syntax backs no source — an unresolved marker must never invent one.
    expect(sources).toEqual([]);
  });

  it("treats a marker-shaped string with an unknown entity type the same way", () => {
    expect(textOf("He studied there [cite:future-type:whatever].")).toBe("He studied there.");
  });

  // An entity type the site has no surface for is machine syntax too — it
  // leaves the prose, but it leaves a trace. Unreachable today (every
  // `CitableEntityType` resolves) — this is the guard for the next type
  // someone adds.
  it("removes a marker it cannot map from the prose, keeping it as an unresolved segment", () => {
    // Injected resolver: no real entity type is unresolvable any more (see
    // the exhaustive case below), so this branch is only reachable through
    // the seam `buildCitedAnswer` exposes for it.
    const answer = buildCitedAnswer(
      "A claim. [cite:project:cowork]",
      NO_WRITING,
      NO_STORY_PARENTS,
      () => undefined,
    );

    expect(answer.sources).toEqual([]);
    expect(
      answer.segments
        .filter((segment) => segment.kind === "text")
        .map((segment) => segment.text)
        .join(""),
    ).toBe("A claim.");
    expect(answer.segments).toContainEqual({
      kind: "unresolved",
      marker: "[cite:project:cowork]",
      offset: 9,
    });
  });

  // Issue 277: the reference is spliced in place, so the sentence's own
  // punctuation stays attached to it however the model spaced the marker.
  it("closes the gap when the model left a space between the marker and the punctuation", () => {
    expect(
      textOf("He built it [cite:project:cowork] . He also shipped [cite:skill:ts] , twice."),
    ).toBe("He built it. He also shipped, twice.");
  });

  it("does not eat a space before the next word — only before punctuation", () => {
    expect(textOf("He built it [cite:project:cowork] and shipped it.")).toBe(
      "He built it and shipped it.",
    );
  });

  it("keeps a single space between words when a marker sits mid-sentence", () => {
    expect(textOf("He built [cite:project:cowork] and shipped it.")).toBe(
      "He built and shipped it.",
    );
  });

  it("does not eat newlines, which the bubble renders as real line breaks", () => {
    expect(textOf("First line.\n\nSecond line. [cite:project:cowork]")).toBe(
      "First line.\n\nSecond line.",
    );
  });

  it("labels a source by entity type and a readable form of its id", () => {
    const { sources } = buildCitedAnswer("Claim. [cite:experience:house-numbers]", NO_WRITING);
    expect(sources[0]?.label).toBe("Experience · House Numbers");
  });

  it("labels a writing source with the entry's own title rather than its id", () => {
    const entries: readonly WritingEntry[] = [
      {
        id: "post-1",
        title: "Why monorepos",
        summary: "summary",
        publishedDate: "2024-01-01",
        body: "Body text.",
        url: "https://example.com/post-1",
      },
    ];
    const { sources } = buildCitedAnswer("Claim. [cite:writing:post-1]", entries);
    expect(sources[0]?.label).toBe("Writing · Why monorepos");
    expect(sources[0]?.href).toBe("https://example.com/post-1");
  });

  it("keeps the original marker text on the source, for the DOM's data-citation attribute", () => {
    const { sources } = buildCitedAnswer("Claim. [cite:skill:typescript]", NO_WRITING);
    expect(sources[0]?.marker).toBe("[cite:skill:typescript]");
  });

  // Issue 227's root cause: `profile`, `education` and `recommendation`
  // markers — which get-profile / list-education / list-recommendations emit
  // on most answers — were treated as unresolvable and silently deleted, so
  // a typical answer showed no citation at all.
  it.each([
    ["profile", "marcos-alvarez"],
    ["education", "unad-bs-systems-engineering"],
    ["recommendation", "some-recommender"],
  ])("renders a %s citation as a real source instead of dropping it (issue 227)", (type, id) => {
    const { sources } = buildCitedAnswer(`A claim. [cite:${type}:${id}]`, NO_WRITING);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.href).not.toBe("/");
    expect(sources[0]?.label).toContain("·");
  });

  it("renders a story citation with a real, non-generic label (#294)", () => {
    const { sources } = buildCitedAnswer(
      "A claim. [cite:story:mutual-informal-leadership]",
      NO_WRITING,
      NO_STORY_PARENTS,
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.label).toContain("·");
    expect(sources[0]?.label).not.toContain("Source ·");
  });

  // Issue 295, epic 288: a story citation must land on its PRIMARY parent
  // experience's anchor when the caller supplies the story -> parent lookup
  // — not the generic `/experience` fallback used when it can't be found.
  it("resolves a story citation's href to its PRIMARY parent experience's anchor when storyParents are supplied", () => {
    const storyParents: readonly StoryParentRef[] = [
      { storyId: "mutual-informal-leadership", experienceId: "mutual" },
    ];
    const { sources } = buildCitedAnswer(
      "A claim. [cite:story:mutual-informal-leadership]",
      NO_WRITING,
      storyParents,
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.href).toBe("/experience#mutual");
  });

  it("covers every citable entity type the agent can emit, so a new type can't silently vanish from answers", () => {
    for (const entityType of citationsModule.CITABLE_ENTITY_TYPES) {
      const { sources } = buildCitedAnswer(`Claim. [cite:${entityType}:some-entity]`, NO_WRITING);
      expect(sources, `no source built for a "${entityType}" citation`).toHaveLength(1);
    }
  });
});
