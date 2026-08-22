import { describe, expect, it } from "vitest";
import {
  InvalidEmbeddingDimensionError,
  parseCitation,
  toVectorLiteral,
} from "./chunks-repository.js";

describe("parseCitation", () => {
  // The `postgres` driver doesn't always parse a `jsonb` column back into an
  // object client-side (observed against a real Neon branch: it came back
  // as the raw JSON string) — this must handle both shapes so a round-trip
  // (insert -> select) never surfaces a stringified citation to callers.
  it("parses a JSON string into a citation object", () => {
    const raw = '{"sourceType":"project","sourceId":"proj-1","label":"Project One"}';
    expect(parseCitation(raw)).toEqual({
      sourceType: "project",
      sourceId: "proj-1",
      label: "Project One",
    });
  });

  it("passes an already-parsed citation object through unchanged", () => {
    const citation = { sourceType: "project", sourceId: "proj-1", label: "Project One" };
    expect(parseCitation(citation)).toEqual(citation);
  });
});

describe("toVectorLiteral", () => {
  it("renders a 768-dimension embedding as a pgvector literal", () => {
    const embedding = new Array(768).fill(0).map((_, i) => (i === 0 ? 0.5 : 0));
    expect(toVectorLiteral(embedding)).toBe(`[0.5,${new Array(767).fill(0).join(",")}]`);
  });

  it("throws InvalidEmbeddingDimensionError when the embedding isn't 768-dimensional", () => {
    expect(() => toVectorLiteral([0.1, 0.2])).toThrow(InvalidEmbeddingDimensionError);
  });

  it("names the expected and actual dimension in the error message", () => {
    try {
      toVectorLiteral([0.1, 0.2]);
      throw new Error("expected toVectorLiteral to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEmbeddingDimensionError);
      expect((error as Error).message).toMatch(/768/);
      expect((error as Error).message).toMatch(/\b2\b/);
    }
  });
});
