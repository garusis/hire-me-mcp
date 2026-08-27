import { describe, expect, it } from "vitest";
import { parseCitationMarker } from "../citations.js";
import { markCitation, markCitations, withCitationMarkers } from "./citation-markers.js";

describe("markCitation", () => {
  it("spells out the marker the model must copy", () => {
    expect(markCitation({ entityType: "gap", entityId: "rust", label: "Rust" })).toEqual({
      entityType: "gap",
      entityId: "rust",
      label: "Rust",
      marker: "[cite:gap:rust]",
    });
  });

  it("carries a fragment through into the marker", () => {
    expect(
      markCitation({
        entityType: "experience",
        entityId: "house-numbers",
        fragment: "highlights.0",
        label: "House Numbers",
      }).marker,
    ).toBe("[cite:experience:house-numbers#highlights.0]");
  });

  it("never mutates the citation it was given", () => {
    const citation = { entityType: "skill" as const, entityId: "typescript", label: "TypeScript" };
    markCitation(citation);
    expect(citation).not.toHaveProperty("marker");
  });

  it("produces a marker the shared parser accepts — the two can never drift", () => {
    for (const entityType of ["profile", "experience", "project", "skill", "gap"] as const) {
      const { marker } = markCitation({ entityType, entityId: "fixture-id", label: "Fixture" });
      expect(parseCitationMarker(marker)).toEqual({ entityType, entityId: "fixture-id" });
    }
  });

  it("never produces a marker naming a tool — issue 270's failure shape", () => {
    const { marker } = markCitation({ entityType: "gap", entityId: "rust", label: "Rust" });
    expect(marker).not.toContain("get-skill-evidence");
  });
});

describe("markCitations", () => {
  it("annotates every citation, in order", () => {
    expect(
      markCitations([
        { entityType: "gap", entityId: "rust", label: "Rust" },
        { entityType: "skill", entityId: "typescript", label: "TypeScript" },
      ]).map((citation) => citation.marker),
    ).toEqual(["[cite:gap:rust]", "[cite:skill:typescript]"]);
  });

  it("returns an empty list for an empty list — an honest no-evidence result stays empty", () => {
    expect(markCitations([])).toEqual([]);
  });
});

describe("withCitationMarkers", () => {
  it("passes `data` through by reference and only rebuilds `citations`", () => {
    const data = { kind: "not-claimed" as const, gap: { id: "rust" } };
    const result = withCitationMarkers({
      data,
      citations: [{ entityType: "gap", entityId: "rust", label: "Rust" }],
    });

    expect(result.data).toBe(data);
    expect(result.citations).toEqual([
      { entityType: "gap", entityId: "rust", label: "Rust", marker: "[cite:gap:rust]" },
    ]);
  });
});
