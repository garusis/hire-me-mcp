import { readFileSync } from "node:fs";
import path from "node:path";
import * as citationsModule from "@hire-me-mcp/agent/citations";
import { describe, expect, it } from "vitest";
import type { WritingEntry } from "../../src/lib/content";
import { buildCitedAnswer } from "./chat-citation-sources";

const SOURCE_PATH = path.join(process.cwd(), "app", "chat", "chat-citation-sources.ts");

const NO_WRITING: readonly WritingEntry[] = [];

function textOf(text: string, writingEntries: readonly WritingEntry[] = NO_WRITING): string {
  return buildCitedAnswer(text, writingEntries)
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
    expect(typeof citationsModule.serializeCitation).toBe("function");

    const source = readFileSync(SOURCE_PATH, "utf-8");
    expect(source).toMatch(/from\s+"@hire-me-mcp\/agent\/citations"/);
    expect(source).toContain("parseCitations");
    expect(source).toContain("serializeCitation");
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

  it("leaves prose carrying an unrecognized marker-shaped string completely alone", () => {
    const unmapped = "He studied there [cite:future-type:whatever].";
    // Not a well-formed marker for any known entity type, so it is not even
    // parsed as one — the prose must survive verbatim rather than losing a
    // chunk of itself.
    expect(textOf(unmapped)).toBe(unmapped);
  });

  // A citation must never fail invisibly again: an entity type the site has
  // no surface for keeps its marker in the text rather than being deleted
  // mid-sentence. Unreachable today (every `CitableEntityType` resolves) —
  // this is the guard for the next type someone adds.
  it("keeps a marker it cannot map in the text verbatim instead of deleting it", () => {
    // Injected resolver: no real entity type is unresolvable any more (see
    // the exhaustive case below), so this branch is only reachable through
    // the seam `buildCitedAnswer` exposes for it.
    const answer = buildCitedAnswer("A claim. [cite:project:cowork]", NO_WRITING, () => undefined);

    expect(answer.sources).toEqual([]);
    expect(
      answer.segments
        .filter((segment) => segment.kind === "text")
        .map((segment) => segment.text)
        .join(""),
    ).toBe("A claim. [cite:project:cowork]");
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

  it("covers every citable entity type the agent can emit, so a new type can't silently vanish from answers", () => {
    for (const entityType of citationsModule.CITABLE_ENTITY_TYPES) {
      const { sources } = buildCitedAnswer(`Claim. [cite:${entityType}:some-entity]`, NO_WRITING);
      expect(sources, `no source built for a "${entityType}" citation`).toHaveLength(1);
    }
  });
});
