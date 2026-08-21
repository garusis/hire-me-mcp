import { describe, expect, it } from "vitest";
import type { CitationMarker } from "./citations.js";
import { parseCitationMarker, parseCitations, serializeCitation } from "./citations.js";

describe("serializeCitation", () => {
  it("serializes an entityType/entityId pair into the [cite:type:id] marker", () => {
    expect(serializeCitation({ entityType: "project", entityId: "cowork" })).toBe(
      "[cite:project:cowork]",
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
