import { describe, expect, it } from "vitest";
import type { ToolCall } from "./tool-routing.js";
import { scoreToolRouting } from "./tool-routing.js";
import type { ReturnedCitation } from "./types.js";

/**
 * Fixture builder: a real tool call is `{ toolName, args, citations }` — see
 * `ToolCall`. `citations` is omitted (`undefined`, "unavailable/unknown")
 * unless explicitly given, matching how `../cli.ts`'s
 * `extractToolCallsFromToolResults` behaves when a tool result's shape
 * doesn't carry a parseable `citations` array.
 */
function call(toolName: string, args?: unknown, citations?: ReturnedCitation[]): ToolCall {
  return { toolName, args, ...(citations !== undefined ? { citations } : {}) };
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

  /**
   * #294 independent-review correction (finding 2): tool-name presence
   * alone cannot prove the known-competency route actually asked for the
   * right competency, or that it ran BEFORE any `search-career` fallback —
   * an empty-args call, a wrong-competency call, or one made after
   * `search-career` all previously scored 1. `options.expectedCompetencies`
   * (`../runner.ts` feeds `EvalCase.expectedCompetencies`) makes both checks
   * executable.
   */
  describe('expected: "list-career-stories" with expectedCompetencies (#294 independent-review correction)', () => {
    it("scores 1 when the located call's competencies argument contains every expected value", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["leadership", "ownership"] })],
        "list-career-stories",
        { expectedCompetencies: ["leadership"] },
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when the located call's competencies argument omits an expected value", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["ownership"] })],
        "list-career-stories",
        { expectedCompetencies: ["leadership"] },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it("scores 0 when the located call carries no competencies argument at all", () => {
      const result = scoreToolRouting([call("list-career-stories")], "list-career-stories", {
        expectedCompetencies: ["leadership"],
      });
      expect(result.score).toBe(0);
    });

    it("scores 0 when a search-career call precedes the list-career-stories call, even with a matching competency", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "leadership" }),
          call("list-career-stories", { competencies: ["leadership"] }),
        ],
        "list-career-stories",
        { expectedCompetencies: ["leadership"] },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/precede|before|first|order/i);
    });

    it("scores 1 when list-career-stories precedes a later search-career fallback", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["leadership"] }),
          call("search-career", { query: "leadership" }),
        ],
        "list-career-stories",
        { expectedCompetencies: ["leadership"] },
      );
      expect(result.score).toBe(1);
    });

    it("ignores expectedCompetencies when not supplied — presence-only check unchanged", () => {
      const result = scoreToolRouting([call("list-career-stories")], "list-career-stories");
      expect(result.score).toBe(1);
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

  /**
   * #294 independent-review correction (finding 1): a name-and-args-only
   * trace cannot tell "search-career returned a story" from "search-career
   * returned nothing" — so it could not enforce that a NON-EMPTY scoped
   * story result gets fetched in full via `list-career-stories`, nor that
   * an empty/unavailable result is what licenses a broader fallback rather
   * than one preceding it. `ToolCall.citations` (populated by
   * `../cli.ts`'s `extractToolCallsFromToolResults` from the real
   * `DomainResult.citations` each call returned) makes that distinction
   * checkable.
   */
  describe('expected: "search-career-story-scoped" — result-state awareness (#294 independent-review correction)', () => {
    it("scores 0 when the story-scoped search returns a NON-EMPTY result but no list-career-stories fetch follows", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "mutual-informal-leadership" },
          ]),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/non-empty|complete story|list-career-stories/i);
    });

    it("scores 1 when the story-scoped search returns a NON-EMPTY result and a list-career-stories fetch follows", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "mutual-informal-leadership" },
          ]),
          call("list-career-stories", { id: "mutual-informal-leadership" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 1 when the story-scoped search returns an EMPTY result and no list-career-stories fetch follows — honest gap, nothing to fetch", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "x", sourceTypes: ["story"] }, [])],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when a broader (non-story-scoped) search-career call precedes the story-scoped one", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x" }),
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/broad|before|precede/i);
    });

    it("scores 1 when a broader (non-story-scoped) search-career call follows an empty story-scoped result AND the answer honestly labels the fallback", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        {
          answer:
            "No direct story supports that behavior, but the closest related evidence is [cite:experience:acme].",
        },
      );
      expect(result.score).toBe(1);
    });
  });

  /**
   * Fourth #294 independent-review correction: an empty/unavailable
   * story-scoped result followed by a broader fallback search used to score
   * 1 unconditionally, regardless of what the final answer said — so a
   * recommendation or experience result surfaced by the broader search could
   * be presented AS the behavioral event itself, with no honest "no direct
   * story" statement. The system prompt (`../../prompt/sections.ts`)
   * requires both: stating plainly that no direct story supports the
   * request, and labelling the broader result as related evidence, not a
   * behavioral event. This block asserts the scorer now enforces that on the
   * ANSWER text, not just the tool-call trace.
   */
  describe('expected: "search-career-story-scoped" — honest fallback labeling (fourth #294 independent-review correction)', () => {
    it("scores 0 when a broader search follows an EMPTY scoped result but the answer never states that no direct story was found", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        { answer: "He led a related effort at Acme: [cite:experience:acme]." },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/no direct story|related evidence|behavioral event/i);
    });

    it("scores 0 when a broader search follows an UNAVAILABLE (citations undefined) scoped result and the answer states the gap but never labels the fallback as related/closest evidence", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        { answer: "No direct story supports that behavior; here is what he did at Acme instead." },
      );
      expect(result.score).toBe(0);
    });

    it("scores 0 when no answer is supplied at all", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
    });

    it("scores 1 when a broader search follows an UNAVAILABLE scoped result and the answer both states the gap and labels the fallback as related evidence", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        {
          answer:
            "No direct story supports that behavior. The closest related evidence, not itself a behavioral event, is [cite:experience:acme].",
        },
      );
      expect(result.score).toBe(1);
    });

    it("does not require any honest labeling when no broader fallback search runs at all", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "x", sourceTypes: ["story"] }, [])],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });
  });

  /**
   * Third #294 independent-review correction (finding 2): a name-and-order
   * check alone cannot tell "the fetched story is the one the scoped search
   * actually surfaced" from "the fetch grabbed an unrelated id", and it
   * permitted a broader fallback search to run even after the scoped search
   * confirmed a non-empty result — #294 permits the broader fallback only
   * after an empty/unavailable story-only result.
   */
  describe('expected: "search-career-story-scoped" — fetched-id and fallback-gating awareness (third #294 independent-review correction)', () => {
    it("scores 0 when the list-career-stories fetch grabs an id that does NOT match any citation the scoped search returned — the exact counterexample the review reproduced", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-001" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/match|id/i);
    });

    it("scores 1 when the list-career-stories fetch grabs an id that DOES match a citation the scoped search returned", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-002" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when a broader search-career call runs AFTER a non-empty scoped result, even though the fetched id matches — the exact counterexample the review reproduced (scoped search returns story 002, list fetches unrelated story 001, then broader search runs)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-002" }),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/broad|non-empty/i);
    });

    it("scores 0 for the original literal reproduction: scoped search returns story 002, list fetches unrelated story 001, then broader search runs", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-001" }),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(0);
    });
  });
});
