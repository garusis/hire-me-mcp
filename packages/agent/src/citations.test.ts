import { describe, expect, it } from "vitest";
import type { CitationMarker } from "./citations.js";
import {
  CITABLE_ENTITY_TYPES,
  parseCitationMarker,
  parseCitationSpans,
  parseCitations,
  serializeCitation,
} from "./citations.js";

describe("serializeCitation", () => {
  it("serializes an entityType/entityId pair into the [cite:type:id] marker", () => {
    expect(serializeCitation({ entityType: "project", entityId: "cowork" })).toBe(
      "[cite:project:cowork]",
    );
  });

  it("serializes a story citation (#294)", () => {
    expect(serializeCitation({ entityType: "story", entityId: "mutual-informal-leadership" })).toBe(
      "[cite:story:mutual-informal-leadership]",
    );
  });

  it("serializes an optional fragment as a trailing #fragment", () => {
    expect(
      serializeCitation({
        entityType: "experience",
        entityId: "house-numbers-2022-senior-full-stack-engineer",
        fragment: "highlights.0",
      }),
    ).toBe("[cite:experience:house-numbers-2022-senior-full-stack-engineer#highlights.0]");
  });
});

describe("parseCitationMarker", () => {
  it("parses a single well-formed marker with no fragment", () => {
    expect(parseCitationMarker("[cite:skill:typescript]")).toEqual({
      entityType: "skill",
      entityId: "typescript",
    });
  });

  it("parses a single well-formed marker with a fragment", () => {
    expect(parseCitationMarker("[cite:project:cowork#highlights.1]")).toEqual({
      entityType: "project",
      entityId: "cowork",
      fragment: "highlights.1",
    });
  });

  it("returns null for a marker with an unknown entity type", () => {
    expect(parseCitationMarker("[cite:not-a-real-type:foo]")).toBeNull();
  });

  it("returns null for malformed input (missing closing bracket)", () => {
    expect(parseCitationMarker("[cite:project:cowork")).toBeNull();
  });

  it("returns null for malformed input (empty entityId)", () => {
    expect(parseCitationMarker("[cite:project:]")).toBeNull();
  });

  it("returns null for a plain string that is not a marker at all", () => {
    expect(parseCitationMarker("just some prose")).toBeNull();
  });

  it("does not throw on adversarial input", () => {
    expect(() => parseCitationMarker(`[cite:${"a".repeat(10_000)}]`)).not.toThrow();
    expect(() => parseCitationMarker("")).not.toThrow();
  });
});

describe("parseCitations", () => {
  it("extracts every marker embedded in a larger streamed text, in order", () => {
    const text =
      "He shipped a 15-service monorepo [cite:experience:house-numbers-2022-senior-full-stack-engineer]. " +
      "He also built [cite:project:cowork] on the side.";

    expect(parseCitations(text)).toEqual([
      { entityType: "experience", entityId: "house-numbers-2022-senior-full-stack-engineer" },
      { entityType: "project", entityId: "cowork" },
    ]);
  });

  it("returns an empty array when the text has no markers", () => {
    expect(parseCitations("plain prose with no citations at all")).toEqual([]);
  });

  it("ignores malformed bracket-like substrings without throwing", () => {
    const text = "broken [cite:project] and [cite:] and [cite:project:cowork] fine";
    expect(() => parseCitations(text)).not.toThrow();
    expect(parseCitations(text)).toEqual([{ entityType: "project", entityId: "cowork" }]);
  });
});

describe("round trip", () => {
  const markers: CitationMarker[] = [
    { entityType: "profile", entityId: "profile" },
    {
      entityType: "experience",
      entityId: "belatrix-software-2018-senior-nodejs-software-developer",
    },
    { entityType: "gap", entityId: "graphql", fragment: "notes" },
  ];

  it.each(markers)("parse(serialize(x)) === x for %o", (marker) => {
    expect(parseCitationMarker(serializeCitation(marker))).toEqual(marker);
  });
});

describe("CITABLE_ENTITY_TYPES", () => {
  // Exported for issue 227: the chat UI has to map EVERY citable type onto a
  // site section, and a hand-maintained duplicate of this list is exactly
  // how `profile`/`education`/`recommendation` citations came to be dropped
  // from answers. A consumer can now iterate the real set in a test.
  it("is the runtime list of every entity type a well-formed marker can carry", () => {
    for (const entityType of CITABLE_ENTITY_TYPES) {
      const marker = parseCitationMarker(`[cite:${entityType}:some-entity]`);
      expect(marker, `"${entityType}" is not accepted by the parser`).not.toBeNull();
      expect(marker?.entityType).toBe(entityType);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(CITABLE_ENTITY_TYPES).size).toBe(CITABLE_ENTITY_TYPES.length);
  });

  it("includes 'story' — career stories are citable (#294)", () => {
    expect(CITABLE_ENTITY_TYPES).toContain("story");
  });
});

describe("parseCitationSpans (issue 270)", () => {
  it("reports a tool-name-shaped marker as marker-shaped but unresolved", () => {
    expect(parseCitationSpans("He hasn't used Rust [cite:get-skill-evidence:rust].")).toEqual([
      { offset: 20, text: "[cite:get-skill-evidence:rust]", marker: null },
    ]);
  });

  it("reports a valid marker with its parsed form and offset", () => {
    expect(parseCitationSpans("a [cite:gap:rust] b")).toEqual([
      { offset: 2, text: "[cite:gap:rust]", marker: { entityType: "gap", entityId: "rust" } },
    ]);
  });

  it("keeps valid and invalid markers in order of appearance", () => {
    expect(
      parseCitationSpans(
        "[cite:gap:rust] x [cite:get-skill-evidence:golang] y [cite:skill:ts]",
      ).map((span) => [span.text, span.marker === null]),
    ).toEqual([
      ["[cite:gap:rust]", false],
      ["[cite:get-skill-evidence:golang]", true],
      ["[cite:skill:ts]", false],
    ]);
  });

  it("ignores brackets that are not marker-shaped at all", () => {
    expect(parseCitationSpans("[not a marker] (cite:gap:rust) [cite:unterminated")).toEqual([]);
  });

  it("does not let an unterminated `[cite:` swallow the rest of a long answer", () => {
    expect(parseCitationSpans(`[cite:${"x".repeat(400)}]`)).toEqual([]);
  });

  it("agrees with parseCitations on the valid markers", () => {
    const text = "[cite:gap:rust] [cite:get-skill-evidence:rust] [cite:project:cowork]";
    expect(
      parseCitationSpans(text)
        .map((span) => span.marker)
        .filter((marker) => marker !== null),
    ).toEqual(parseCitations(text));
  });
});
