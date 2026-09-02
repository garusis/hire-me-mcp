import { describe, expect, it } from "vitest";
import { scoreToolRouting } from "./tool-routing.js";

describe("scoreToolRouting", () => {
  describe('expected: "search-career"', () => {
    it("scores 1 when search-career appears in the tool-call trace", () => {
      const result = scoreToolRouting(["get-skill-evidence", "search-career"], "search-career");
      expect(result.score).toBe(1);
    });

    it("scores 0 when search-career never appears in the tool-call trace", () => {
      const result = scoreToolRouting(["get-experience"], "search-career");
      expect(result.score).toBe(0);
    });

    it("scores 0 for an empty tool-call trace", () => {
      const result = scoreToolRouting([], "search-career");
      expect(result.score).toBe(0);
    });
  });

  describe('expected: "deterministic-only"', () => {
    it("scores 1 when search-career never appears in the tool-call trace", () => {
      const result = scoreToolRouting(["get-experience", "get-profile"], "deterministic-only");
      expect(result.score).toBe(1);
    });

    it("scores 0 when search-career appears anywhere in the tool-call trace", () => {
      const result = scoreToolRouting(["get-experience", "search-career"], "deterministic-only");
      expect(result.score).toBe(0);
    });

    it("scores 1 for an empty tool-call trace (no semantic search called is trivially satisfied)", () => {
      const result = scoreToolRouting([], "deterministic-only");
      expect(result.score).toBe(1);
    });
  });

  it("returns a human-readable reason naming the tool-call trace it saw", () => {
    const result = scoreToolRouting(["get-experience"], "search-career");
    expect(result.reason).toMatch(/get-experience/);
    expect(result.reason).toMatch(/search-career/);
  });

  describe('expected: "list-career-stories" (#294)', () => {
    it("scores 1 when list-career-stories appears in the tool-call trace", () => {
      const result = scoreToolRouting(["list-career-stories"], "list-career-stories");
      expect(result.score).toBe(1);
    });

    it("scores 0 when list-career-stories never appears in the tool-call trace", () => {
      const result = scoreToolRouting(["get-experience", "search-career"], "list-career-stories");
      expect(result.score).toBe(0);
    });

    it("scores 0 for an empty tool-call trace", () => {
      const result = scoreToolRouting([], "list-career-stories");
      expect(result.score).toBe(0);
    });

    it("returns a human-readable reason naming the tool-call trace it saw", () => {
      const result = scoreToolRouting(["search-career"], "list-career-stories");
      expect(result.reason).toMatch(/list-career-stories/);
      expect(result.reason).toMatch(/search-career/);
    });
  });

  describe('expected: "deterministic-only" with list-career-stories in the trace (#294)', () => {
    it("still scores 1 — list-career-stories is deterministic, not semantic search", () => {
      const result = scoreToolRouting(["list-career-stories"], "deterministic-only");
      expect(result.score).toBe(1);
    });
  });
});
