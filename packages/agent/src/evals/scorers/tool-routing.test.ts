import { describe, expect, it } from "vitest";
import type { ToolCall } from "./tool-routing.js";
import { scoreToolRouting } from "./tool-routing.js";

/** Fixture builder: a real tool call is `{ toolName, args }` — see `ToolCall`. */
function call(toolName: string, args?: unknown): ToolCall {
  return { toolName, args };
}

describe("scoreToolRouting", () => {
  describe('expected: "search-career"', () => {
    it("scores 1 when search-career appears in the tool-call trace", () => {
      const result = scoreToolRouting(
        [call("get-skill-evidence"), call("search-career")],
        "search-career",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when search-career never appears in the tool-call trace", () => {
      const result = scoreToolRouting([call("get-experience")], "search-career");
      expect(result.score).toBe(0);
    });

    it("scores 0 for an empty tool-call trace", () => {
      const result = scoreToolRouting([], "search-career");
      expect(result.score).toBe(0);
    });
  });

  describe('expected: "deterministic-only"', () => {
    it("scores 1 when search-career never appears in the tool-call trace", () => {
      const result = scoreToolRouting(
        [call("get-experience"), call("get-profile")],
        "deterministic-only",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when search-career appears anywhere in the tool-call trace", () => {
      const result = scoreToolRouting(
        [call("get-experience"), call("search-career")],
        "deterministic-only",
      );
      expect(result.score).toBe(0);
    });

    it("scores 1 for an empty tool-call trace (no semantic search called is trivially satisfied)", () => {
      const result = scoreToolRouting([], "deterministic-only");
      expect(result.score).toBe(1);
    });
  });

  it("returns a human-readable reason naming the tool-call trace it saw", () => {
    const result = scoreToolRouting([call("get-experience")], "search-career");
    expect(result.reason).toMatch(/get-experience/);
    expect(result.reason).toMatch(/search-career/);
  });

  describe('expected: "list-career-stories" (#294)', () => {
    it("scores 1 when list-career-stories appears in the tool-call trace", () => {
      const result = scoreToolRouting([call("list-career-stories")], "list-career-stories");
      expect(result.score).toBe(1);
    });

    it("scores 0 when list-career-stories never appears in the tool-call trace", () => {
      const result = scoreToolRouting(
        [call("get-experience"), call("search-career")],
        "list-career-stories",
      );
      expect(result.score).toBe(0);
    });

    it("scores 0 for an empty tool-call trace", () => {
      const result = scoreToolRouting([], "list-career-stories");
      expect(result.score).toBe(0);
    });

    it("returns a human-readable reason naming the tool-call trace it saw", () => {
      const result = scoreToolRouting([call("search-career")], "list-career-stories");
      expect(result.reason).toMatch(/list-career-stories/);
      expect(result.reason).toMatch(/search-career/);
    });
  });

  describe('expected: "deterministic-only" with list-career-stories in the trace (#294)', () => {
    it("still scores 1 — list-career-stories is deterministic, not semantic search", () => {
      const result = scoreToolRouting([call("list-career-stories")], "deterministic-only");
      expect(result.score).toBe(1);
    });
  });

  /**
   * #294 independent-review correction: the fuzzy behavioral route requires
   * `search-career` to actually be called WITH `sourceTypes: ["story"]`
   * (not merely called), and — when a complete story is subsequently
   * fetched — that story-scoped call must come BEFORE the
   * `list-career-stories` fetch, per #305 decision 5's locked route. A
   * scorer that only checks tool NAMES cannot detect a run that called
   * `search-career` with no `sourceTypes` at all.
   */
  describe('expected: "search-career-story-scoped" (#294)', () => {
    it("scores 1 when search-career is called with sourceTypes including 'story'", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "how does he lead", sourceTypes: ["story"] })],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when search-career is called WITHOUT sourceTypes — the exact defect a name-only trace check cannot see", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "how does he lead" })],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
    });

    it("scores 0 when search-career is called with sourceTypes not including 'story'", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "x", sourceTypes: ["experience"] })],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
    });

    it("scores 0 for an empty tool-call trace", () => {
      const result = scoreToolRouting([], "search-career-story-scoped");
      expect(result.score).toBe(0);
    });

    it("scores 1 when the story-scoped search precedes fetching the complete story via list-career-stories", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }),
          call("list-career-stories", { id: "xogito-client-account-recovery" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when list-career-stories is called BEFORE the story-scoped search-career call — sequence violation, not just presence", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { id: "xogito-client-account-recovery" }),
          call("search-career", { query: "x", sourceTypes: ["story"] }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
    });

    it("returns a human-readable reason distinguishing 'never called with sourceTypes' from 'wrong order'", () => {
      const missingArgs = scoreToolRouting(
        [call("search-career", { query: "x" })],
        "search-career-story-scoped",
      );
      expect(missingArgs.reason).toMatch(/sourceTypes/);

      const wrongOrder = scoreToolRouting(
        [
          call("list-career-stories"),
          call("search-career", { query: "x", sourceTypes: ["story"] }),
        ],
        "search-career-story-scoped",
      );
      expect(wrongOrder.reason).toMatch(/precede|before|order/i);
    });
  });
});
