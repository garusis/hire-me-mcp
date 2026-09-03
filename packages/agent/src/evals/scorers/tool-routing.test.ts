import { describe, expect, it } from "vitest";
import type { ToolCall } from "./tool-routing.js";
import { ABSENT_STORY_PATTERN, scoreToolRouting } from "./tool-routing.js";
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

    it("scores 1 when the story-scoped search returns a NON-EMPTY result and a list-career-stories fetch follows and confirms the same story (#307 fourth independent-review correction: confirmation is required, not merely issuing the call)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "mutual-informal-leadership" },
          ]),
          call("list-career-stories", { id: "mutual-informal-leadership" }, [
            { entityType: "story", entityId: "mutual-informal-leadership" },
          ]),
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

    it("scores 1 when the list-career-stories fetch grabs an id that DOES match a citation the scoped search returned, and its own result confirms the same story (#307 fourth independent-review correction)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-002" }, [
            { entityType: "story", entityId: "story-002" },
          ]),
        ],
        "search-career-story-scoped",
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when a broader search-career call runs AFTER a non-empty scoped result, even though the fetched id matches and is confirmed — the exact counterexample the review reproduced (scoped search returns story 002, list fetches unrelated story 001, then broader search runs)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "story-002" },
          ]),
          call("list-career-stories", { id: "story-002" }, [
            { entityType: "story", entityId: "story-002" },
          ]),
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

  /**
   * #307 owner-approved decision 3: "Honest semantic equivalents of no
   * direct story are valid; no literal phrase lock." The prior
   * `NO_DIRECT_STORY_REGEX` recognized only "no direct/specific story"
   * shaped sentences, so an equally honest absence statement phrased
   * differently ("the career records do not contain an account of...")
   * failed the honest-fallback-labeling check even though it says the same
   * thing. `ABSENT_STORY_PATTERN` is exported so the dataset's own N01/N02
   * `mustMatch` assertions (`../dataset/story-manifest-cases.ts`) share the
   * same broadened wording instead of duplicating a narrower one.
   */
  describe("honest absence wording accepts semantic equivalents, not just the literal phrase (#307 decision 3)", () => {
    it("accepts 'the career records do not contain an account of' as an honest no-direct-story statement", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        {
          answer:
            "The career records do not contain an account of that. The closest related " +
            "evidence, not itself a behavioral event, is [cite:experience:acme].",
        },
      );
      expect(result.score).toBe(1);
    });

    it("accepts 'he hasn't done a project where' as an honest no-direct-story statement", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        {
          answer:
            "He hasn't done a project where that happened. The closest related evidence, not " +
            "itself a behavioral event, is [cite:experience:acme].",
        },
      );
      expect(result.score).toBe(1);
    });

    it("still exposes ABSENT_STORY_PATTERN as a usable regex source string", () => {
      expect(typeof ABSENT_STORY_PATTERN).toBe("string");
      expect(() => new RegExp(ABSENT_STORY_PATTERN, "i")).not.toThrow();
    });
  });

  /**
   * #307 owner-approved decision 1: "A correct behavioral answer may use
   * either list-career-stories or story-scoped search when it retrieves and
   * cites an acceptable story." The prior scorer locked ONE route per case,
   * so a run that used the other tool but still retrieved and correctly
   * cited an acceptable story scored 0 purely on route disagreement.
   */
  describe("either route (list-career-stories or story-scoped search) is accepted when it retrieves and cites an acceptable story (#307 decision 1)", () => {
    it('expected "search-career-story-scoped": scores 1 when list-career-stories alone (no search-career at all) retrieves a story the final answer actually cites', () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
          ]),
        ],
        "search-career-story-scoped",
        {
          answer:
            "He redesigned the public upload workflow with rate limiting. " +
            "[cite:story:house-numbers-secure-public-document-upload]",
        },
      );
      expect(result.score).toBe(1);
    });

    it('expected "search-career-story-scoped": still scores 0 when list-career-stories retrieves a story but the answer never actually cites it', () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
          ]),
        ],
        "search-career-story-scoped",
        { answer: "He has worked on secure uploads before." },
      );
      expect(result.score).toBe(0);
    });

    it('expected "list-career-stories": scores 1 when a story-scoped search-career call (not list-career-stories) retrieves a story, a confirming list-career-stories fetch of that same story follows, and the final answer cites it', () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "public upload", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
          ]),
          call("list-career-stories", { id: "house-numbers-secure-public-document-upload" }, [
            { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
          ]),
        ],
        "list-career-stories",
        {
          answer:
            "He redesigned the public upload workflow with rate limiting. " +
            "[cite:story:house-numbers-secure-public-document-upload]",
        },
      );
      expect(result.score).toBe(1);
    });

    it('expected "list-career-stories": still scores 0 (the original competency-argument check) when neither route retrieved a cited story', () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["ownership"] })],
        "list-career-stories",
        { expectedCompetencies: ["leadership"] },
      );
      expect(result.score).toBe(0);
    });
  });

  /**
   * #307 second independent-review rejection of the original either-route
   * implementation: it accepted ANY story-route call's citation the answer
   * cited, regardless of whether that story was actually acceptable for the
   * case, and it applied to the SAME tool the case's own route-specific
   * scorer already validates — bypassing that scorer's fetch/order/honesty
   * checks entirely. These four tests are the review's own direct
   * counterexamples: all must score 0.
   */
  describe("either-route acceptance is scoped to the case's acceptable story ids and to the alternate tool only (#307 second independent review)", () => {
    it("repro 1: the tool returns and the answer cites a story that is NOT in the case's acceptable story ids", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "wrong-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:wrong-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 2: the answer cites expected-story, but the list-career-stories call's own confirmed (empty) citations don't include it", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["risk-management"] }, [])],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 3: a story-scoped search itself (the case's OWN route, not the alternate) returns and cites expected-story, but no list-career-stories fetch follows — the alternate-route shortcut must not bypass scoreStoryScoped's own fetch requirement", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 4: a story-scoped case uses only list-career-stories (never the required scoped search), cites an unacceptable story, and states there is no matching story", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "some-other-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "There is no matching story for that. [cite:story:some-other-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("valid alternate: expected story-scoped, list-career-stories (alternate tool) retrieves and cites an id present in the case's acceptable story ids", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(1);
    });

    it("valid alternate: expected list-career-stories, a story-scoped search (alternate tool) retrieves an acceptable story, a confirming list-career-stories fetch of that same story follows, and the answer cites it", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
          call("list-career-stories", { id: "expected-story" }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(1);
    });
  });

  /**
   * #307 third independent-review rejection of the second correction
   * (`1112e12`): the alternate-route path still granted success from the
   * scoped search's own citations alone, without applying `scoreStoryScoped`
   * or `scoreListCareerStories`'s full retrieval semantics (order, complete-
   * story fetch, honest-absence gating) to whichever route the trace
   * actually used. These four tests are the review's own direct
   * counterexamples: all must score 0.
   */
  describe("alternate and list-only routes must satisfy the same retrieval semantics as the case's own route (#307 third independent review)", () => {
    it("repro 1: an alternate story-scoped search returns and cites an acceptable story, but no list-career-stories fetch of the complete story follows", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 2: a story-scoped case reaches a no-evidence conclusion through list-career-stories alone, even though it cites an acceptable story", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "There is no matching story for that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 3: list-career-stories' own citations are undefined (unconfirmed) even though the answer cites an acceptable story", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["risk-management"] })],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("repro 4: a story-scoped search returns an acceptable story, but the following list-career-stories fetch of that same id confirms nothing (empty citations)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
          call("list-career-stories", { id: "expected-story" }, []),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("valid: an empty/unavailable story-scoped search honestly licenses an absence answer, with no fetch and no acceptable-story citation required", () => {
      const result = scoreToolRouting(
        [call("search-career", { query: "x", sourceTypes: ["story"] }, [])],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "There is no matching story for that.",
        },
      );
      expect(result.score).toBe(1);
    });
  });

  /**
   * #307 fourth independent-review rejection of `aa7ecd4`: two fail-open
   * paths remained in `checkNonEmptyScopedFollowUp` and `ABSENT_STORY_PATTERN`.
   * These are the review's own direct counterexamples: both must score 0.
   */
  describe("full-story-fetch confirmation fails closed, and the absence matcher covers common semantic equivalents (#307 fourth independent review)", () => {
    it("repro 1: a non-empty scoped result's matching-id fetch has UNDEFINED citations — unconfirmed, not proof of a successful full-story fetch", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
          call("list-career-stories", { id: "expected-story" }),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("fails when the matching-id fetch's confirmed citations are of the wrong entityType (not a story)", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
          call("list-career-stories", { id: "expected-story" }, [
            { entityType: "experience", entityId: "expected-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("still scores 1 when the matching-id fetch's confirmed citations include a story entityType matching the fetched id", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
          call("list-career-stories", { id: "expected-story" }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "search-career-story-scoped",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "He did that. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(1);
    });

    it('repro 2: a list-only route reaches a "no evidence" absence conclusion — the shared matcher must catch this phrasing, not just "no matching story"', () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer:
            "I found no evidence of a matching behavioral example. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it('repro 2b: a list-only route reaches a "no example" absence conclusion', () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "There is no example that directly addresses this. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it('accepts "no evidence" and "no example" as honest fallback-labeling wording on the story-scoped route, same as the existing literal phrases', () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "x", sourceTypes: ["story"] }, []),
          call("search-career", { query: "x" }),
        ],
        "search-career-story-scoped",
        {
          answer:
            "I found no evidence of a matching example. The closest related evidence, not " +
            "itself a behavioral event, is [cite:experience:acme].",
        },
      );
      expect(result.score).toBe(1);
    });

    it('does not treat a positive sentence that merely discusses "evidence" as a semantic absence conclusion', () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }, [
            { entityType: "story", entityId: "expected-story" },
          ]),
        ],
        "list-career-stories",
        {
          acceptableStoryIds: ["expected-story"],
          answer: "The closest related evidence backs this up clearly. [cite:story:expected-story]",
        },
      );
      expect(result.score).toBe(1);
    });
  });
});
