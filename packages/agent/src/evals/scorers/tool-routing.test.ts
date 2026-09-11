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

  /**
   * #307 owner-approved decision (issuecomment-5575463218): "accept a valid
   * competency filter that actually retrieves and cites an acceptable
   * story, rather than requiring one exact competency label." Prior
   * behavior was asymmetric: the case's own `list-career-stories` route
   * (`scoreListCareerStories`) required an EXACT match to
   * `expectedCompetencies`, rejecting a real, valid supporting competency
   * (e.g. `technical-judgment`, one of `fullstack-labs-sap-migration`'s
   * `supportingCompetencies`, per its story record) even when it correctly
   * retrieved and cited the case's acceptable story — while the alternate
   * route (`scoreListCareerStoriesAsAlternate`, used when a
   * `search-career-story-scoped` case is instead answered via
   * `list-career-stories` alone) skipped competency validation entirely,
   * letting an arbitrary, uncontrolled string (e.g. "SAP" itself — a
   * vendor name the competency taxonomy explicitly excludes, per
   * `packages/career-data/src/schemas/competency.ts`) through unchecked.
   * These tests fix that symmetry: both routes now accept an exact match OR
   * any valid controlled-vocabulary competency filter that goes on to
   * retrieve and cite an acceptable story, and both reject an
   * invalid/arbitrary filter even when it happens to retrieve the right
   * story.
   */
  describe("expected-list vs alternate-list competency-filter symmetry (#307 owner-approved decision)", () => {
    const sapStoryId = "fullstack-labs-sap-migration";
    const sapCitation: ReturnedCitation = { entityType: "story", entityId: sapStoryId };

    it('positive (own route, SAP supporting competency): scores 1 when the list-career-stories call uses a valid SUPPORTING competency ("technical-judgment") instead of the exact expected primary competency ("risk-management"), and it retrieves and cites the acceptable story', () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(1);
    });

    it("positive (equivalent alternate route): the same valid-supporting-competency retrieval scores 1 when list-career-stories is used as the alternate to search-career-story-scoped", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation])],
        "search-career-story-scoped",
        {
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(1);
    });

    it('negative (own route, invalid filter): scores 0 when the competencies argument is an arbitrary, uncontrolled string ("SAP" itself, not a competency) even though it retrieves and cites the acceptable story', () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["SAP"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it('negative (alternate route, invalid filter): scores 0 when list-career-stories (used as the alternate route) filters by an arbitrary string ("SAP") even though it retrieves and cites the acceptable story', () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["SAP"] }, [sapCitation])],
        "search-career-story-scoped",
        {
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it("negative (missing result evidence): scores 0 when the supporting-competency filter is valid but the call's citations are undefined (unconfirmed) — an unconfirmed result cannot license the loosened acceptance", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] })],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
    });

    it("negative (unrelated citation): scores 0 when the valid supporting-competency filter's confirmed citation is for a story NOT in the case's acceptable story ids", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["technical-judgment"] }, [
            { entityType: "story", entityId: "unrelated-story" },
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: "He did something else. [cite:story:unrelated-story]",
        },
      );
      expect(result.score).toBe(0);
    });

    it("negative (wrong order): scores 0 when search-career precedes list-career-stories, even with a valid supporting competency and a confirmed acceptable citation", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "financial discrepancy" }),
          call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/precede|before|first|order/i);
    });

    it("negative (existing fallback control intact): the loosened supporting-competency path still fails when the answer cites a story the call's own confirmed citations don't include (citesUnreturnedStory safeguard)", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer:
            `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}] ` +
            "[cite:story:unreturned-story]",
        },
      );
      expect(result.score).toBe(0);
    });
  });

  /**
   * Codex independent review of `a7ea727` (issuecomment-5575583880):
   * `hasAllCompetencies`'s exact-match check only requires the located
   * call's `competencies` array to CONTAIN every `expectedCompetencies`
   * value (`.includes`, a subset check) — it never verifies the array
   * carries no OTHER, invalid entries. So a mixed filter like
   * `["risk-management", "SAP"]` against `expectedCompetencies:
   * ["risk-management"]` satisfies `exactMatch` on the own route
   * (`scoreListCareerStories`) purely by containment, while the identical
   * trace scores 0 on the alternate route (`scoreListCareerStoriesAsAlternate`)
   * because `hasValidCompetencyFilter` correctly rejects "SAP" as
   * uncontrolled vocabulary — the exact asymmetric repro the review
   * reported. Separately, when `expectedCompetencies` is undefined/empty
   * (the alternate route always calls with `undefined`, and an own-route
   * case may too), the entire competency-filter check was skipped
   * entirely, so an invalid-only or mixed filter went unchecked on that
   * path even within the `acceptableStoryIds` behavioral scope. Both
   * routes must now reject a competencies filter containing any
   * non-controlled-vocabulary entry, regardless of whether
   * `expectedCompetencies` is present, while still accepting a genuinely
   * valid filter (exact or supporting) that retrieves and cites an
   * acceptable story.
   */
  describe("competency-filter controlled-vocabulary validation is symmetric and total, not just an exact-match shortcut (Codex independent review, issuecomment-5575583880)", () => {
    const sapStoryId = "fullstack-labs-sap-migration";
    const sapCitation: ReturnedCitation = { entityType: "story", entityId: sapStoryId };

    const table: Array<{
      name: string;
      expected: "list-career-stories" | "search-career-story-scoped";
      expectedCompetencies?: readonly string[];
      wantScore: 0 | 1;
    }> = [
      {
        name: "own route (expected 'list-career-stories'): a MIXED valid+invalid filter that contains the exact expected value must NOT pass on containment alone",
        expected: "list-career-stories",
        expectedCompetencies: ["risk-management"],
        wantScore: 0,
      },
      {
        name: "alternate route (expected 'search-career-story-scoped'): the identical mixed valid+invalid filter must also score 0 — same trace, same verdict as the own route",
        expected: "search-career-story-scoped",
        expectedCompetencies: undefined,
        wantScore: 0,
      },
    ];

    for (const { name, expected, expectedCompetencies, wantScore } of table) {
      it(name, () => {
        const result = scoreToolRouting(
          [
            call("list-career-stories", { competencies: ["risk-management", "SAP"] }, [
              sapCitation,
            ]),
          ],
          expected,
          {
            expectedCompetencies,
            acceptableStoryIds: [sapStoryId],
            answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
          },
        );
        expect(result.score).toBe(wantScore);
        if (wantScore === 0) {
          expect(result.reason).toMatch(/competenc/i);
        }
      });
    }

    it("own route: an invalid-only filter (no valid entries at all) scores 0 even when expectedCompetencies is undefined/empty and the call retrieves and cites an acceptable story — the unchecked-when-undefined gap", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["SAP"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: undefined,
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it("own route: an invalid-only filter scores 0 even with an EMPTY expectedCompetencies array (not just undefined)", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["SAP"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: [],
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
    });

    it("own route: a genuinely valid supporting-competency filter still scores 1 with expectedCompetencies undefined, when it actually retrieves and cites the acceptable story — the loosened acceptance must survive the tightened check", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: undefined,
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(1);
    });

    it("own route: with BOTH expectedCompetencies and acceptableStoryIds undefined (outside the behavioral-story scope), the legacy presence-only leniency is preserved and an unvalidated filter that cites the call's own returned story still scores 1", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies: undefined,
          acceptableStoryIds: undefined,
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(1);
    });

    it("alternate route: an invalid-only filter scores 0 (regression guard — must remain 0 after the fix, same as before)", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["SAP"] }, [sapCitation])],
        "search-career-story-scoped",
        {
          acceptableStoryIds: [sapStoryId],
          answer: `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
    });
  });

  /**
   * Codex independent routing review of `de326d5` (issuecomment-5575701584):
   * `hasCompetencyFilter` decided "filter present" purely by
   * `Array.isArray(competencies) && competencies.length > 0` — so a
   * MALFORMED-but-present value (a string, a number, `null`, a plain object:
   * none of them arrays) was indistinguishable from an OMITTED field. The
   * reported repro: own route (`expected: "list-career-stories"`) with
   * `expectedCompetencies` undefined, `acceptableStoryIds` set, and a
   * confirmed citation to the acceptable story — `competencies: "SAP"` (or
   * `42`) scored 1 (the bug: read as "no filter", so nothing to validate),
   * while the identical trace scored 0 on the alternate route
   * (`expected: "search-career-story-scoped"`, actual call
   * `list-career-stories`) only because `scoreListCareerStoriesAsAlternate`
   * separately, unconditionally requires `hasValidCompetencyFilter` — an
   * accident of that other check catching it, not of `hasCompetencyFilter`
   * doing its job.
   *
   * This matrix locks the corrected symmetric behavior across every
   * `competencies` shape:
   * - `undefined` (omitted) and `[]` (explicit empty array) are the tool
   *   schema's own OWNED "no constraint" semantics
   *   (`apps/web/lib/mcp/tools/list-career-stories.ts`: "Omit, or pass an
   *   empty array, for no constraint") — legitimately absent, not malformed.
   * - Any other present value — a non-array primitive/object, `null`, or an
   *   array containing a non-string/invalid entry — is a MALFORMED filter,
   *   never treated as "no filter", and must fail validation on both routes
   *   identically.
   * - A genuinely valid controlled-vocabulary array still passes via the
   *   existing exact/supporting-match acceptance, unchanged.
   */
  describe("competencies filter-shape matrix: malformed-present values are never conflated with an omitted filter (Codex independent routing review, issuecomment-5575701584)", () => {
    const sapStoryId = "fullstack-labs-sap-migration";
    const sapCitation: ReturnedCitation = { entityType: "story", entityId: sapStoryId };
    const acceptableAnswer = `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`;

    function runOwnRoute(
      competencies: unknown,
      expectedCompetencies: readonly string[] | undefined,
    ): number {
      const args =
        competencies === "__absent__" ? {} : ({ competencies } as Record<string, unknown>);
      return scoreToolRouting(
        [call("list-career-stories", args, [sapCitation])],
        "list-career-stories",
        {
          expectedCompetencies,
          acceptableStoryIds: [sapStoryId],
          answer: acceptableAnswer,
        },
      ).score;
    }

    function runAlternateRoute(competencies: unknown): number {
      const args =
        competencies === "__absent__" ? {} : ({ competencies } as Record<string, unknown>);
      return scoreToolRouting(
        [call("list-career-stories", args, [sapCitation])],
        "search-career-story-scoped",
        { acceptableStoryIds: [sapStoryId], answer: acceptableAnswer },
      ).score;
    }

    /**
     * Codex independent review (issuecomment-5575823109): the previous
     * version of this matrix labeled the alternate route's no-filter
     * behavior "out of scope", but the prior independent review already
     * required legitimate omitted/empty semantics to be consistent across
     * both routes. `scoreListCareerStoriesAsAlternate`'s own, separate
     * `hasValidCompetencyFilter` gate (added in a7ea727) unconditionally
     * required a non-empty, valid array — even for a legitimately
     * absent/empty filter, which is never an "invalid" filter, just no
     * filter at all — so an omitted/`[]` competencies argument scored 1 on
     * the own route but 0 on the alternate route despite an identical,
     * confirmed, acceptable citation. This block now asserts both routes
     * score equally for every legitimate no-filter shape, while an actually
     * invalid PRESENT filter (covered by the malformed-shapes and
     * dedicated-invalid-filter tests elsewhere in this file) must still
     * score 0 on both, and a no-filter case with missing/unrelated evidence
     * must still score 0 on both — the fix narrows the alternate route's
     * extra gate to reject only present-and-invalid filters, it does not
     * remove evidence checking.
     */
    describe("legitimate no-filter shapes score equally on both routes when an acceptable story is confirmed and cited (Codex independent review, issuecomment-5575823109)", () => {
      const legitimateShapes: Array<{ name: string; value: unknown }> = [
        { name: "competencies key entirely omitted", value: "__absent__" },
        { name: "competencies explicitly undefined", value: undefined },
        { name: "competencies: [] (explicit empty array)", value: [] },
      ];

      for (const { name, value } of legitimateShapes) {
        it(`${name}: own route — with expectedCompetencies present, scores 0 (a filter was required and none was supplied)`, () => {
          expect(runOwnRoute(value, ["risk-management"])).toBe(0);
        });

        it(`${name}: own route — with expectedCompetencies undefined, scores 1 (no filter required, acceptable story confirmed and cited)`, () => {
          expect(runOwnRoute(value, undefined)).toBe(1);
        });

        it(`${name}: alternate route — scores 1, matching the own route (no filter to validate, and the acceptable story is confirmed and cited)`, () => {
          expect(runAlternateRoute(value)).toBe(1);
        });
      }

      it("own route: an omitted filter still scores 0 when the call's citations are undefined (unconfirmed) — no filter to blame, but no confirmed evidence either", () => {
        const result = scoreToolRouting([call("list-career-stories", {})], "list-career-stories", {
          expectedCompetencies: undefined,
          acceptableStoryIds: [sapStoryId],
          answer: acceptableAnswer,
        });
        expect(result.score).toBe(0);
      });

      it("alternate route: an omitted filter still scores 0 when the call's citations are undefined (unconfirmed) — the fix must not become an unconditional pass", () => {
        const result = scoreToolRouting(
          [call("list-career-stories", {})],
          "search-career-story-scoped",
          { acceptableStoryIds: [sapStoryId], answer: acceptableAnswer },
        );
        expect(result.score).toBe(0);
      });

      it("own route: an empty-array filter still scores 0 when the confirmed citation is for an unrelated story, not an acceptable one", () => {
        const result = scoreToolRouting(
          [
            call("list-career-stories", { competencies: [] }, [
              { entityType: "story", entityId: "unrelated-story" },
            ]),
          ],
          "list-career-stories",
          {
            expectedCompetencies: undefined,
            acceptableStoryIds: [sapStoryId],
            answer: "He did something else. [cite:story:unrelated-story]",
          },
        );
        expect(result.score).toBe(0);
      });

      it("alternate route: an empty-array filter still scores 0 when the confirmed citation is for an unrelated story, not an acceptable one", () => {
        const result = scoreToolRouting(
          [
            call("list-career-stories", { competencies: [] }, [
              { entityType: "story", entityId: "unrelated-story" },
            ]),
          ],
          "search-career-story-scoped",
          {
            acceptableStoryIds: [sapStoryId],
            answer: "He did something else. [cite:story:unrelated-story]",
          },
        );
        expect(result.score).toBe(0);
      });
    });

    describe("malformed-present shapes score 0 on BOTH routes, symmetrically, regardless of expectedCompetencies", () => {
      const malformedShapes: Array<{ name: string; value: unknown }> = [
        { name: 'competencies: a bare string ("SAP")', value: "SAP" },
        { name: "competencies: a number (42)", value: 42 },
        { name: "competencies: null", value: null },
        { name: "competencies: a plain object ({})", value: {} },
        { name: "competencies: an array with a non-string entry ([42])", value: [42] },
        { name: "competencies: an array with a null entry ([null])", value: [null] },
        {
          name: 'competencies: an array mixing a valid entry with a non-string entry (["risk-management", 42])',
          value: ["risk-management", 42],
        },
      ];

      for (const { name, value } of malformedShapes) {
        it(`${name}: own route scores 0 with expectedCompetencies present`, () => {
          expect(runOwnRoute(value, ["risk-management"])).toBe(0);
        });

        it(`${name}: own route scores 0 with expectedCompetencies undefined (the exact reported repro shape)`, () => {
          expect(runOwnRoute(value, undefined)).toBe(0);
        });

        it(`${name}: alternate route also scores 0 — same verdict as the own route, no asymmetry`, () => {
          expect(runAlternateRoute(value)).toBe(0);
        });
      }
    });

    describe("a genuinely valid controlled-vocabulary filter is unaffected by the fix", () => {
      it("own route: a valid supporting-competency array still scores 1 with expectedCompetencies undefined", () => {
        expect(runOwnRoute(["technical-judgment"], undefined)).toBe(1);
      });

      it("own route: a valid exact-match array still scores 1 with expectedCompetencies present", () => {
        expect(runOwnRoute(["risk-management"], ["risk-management"])).toBe(1);
      });

      it("alternate route: a valid supporting-competency array still scores 1", () => {
        expect(runAlternateRoute(["technical-judgment"])).toBe(1);
      });
    });
  });

  /**
   * #307 assignment A (issuecomment-5591843129 / diagnosis issuecomment-5591743584,
   * section (a) / C1): the scorer only ever evaluated the FIRST
   * `list-career-stories` call in the trace (`located =
   * toolCalls[listCareerStoriesIndex]` / `toolCalls.find(...)`). The saved
   * X05 trace shows a first call whose args carried an unknown key
   * (`query`), which Mastra's `.strict()` tool-input validation rejects
   * before the tool runs — so that call's `citations` is `undefined`
   * ("unavailable") — followed by a second, valid call that DID return and
   * the answer DID cite. The scorer must recognize the later valid,
   * evidenced call instead of failing solely because the first call carried
   * no evidence.
   */
  describe("recovery: a later valid list-career-stories call that itself returns the acceptable, answer-cited story after an unavailable/empty first result (#307 assignment A)", () => {
    const sapStoryId = "fullstack-labs-sap-migration";
    const sapCitation: ReturnedCitation = { entityType: "story", entityId: sapStoryId };
    const sapAnswer = `He caught a subtle financial-data discrepancy. [cite:story:${sapStoryId}]`;

    it("reproduces the saved X05 trace: first call's citations are UNDEFINED (unavailable — unparseable tool-input-validation-failure result), second call is confirmed and cited — own route scores 1", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", {
            competencies: ["problem-solving", "technical-judgment"],
            query: "financial discrepancy data",
          }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(1);
    });

    it("same trace with the first call's citations CONFIRMED EMPTY ([]) instead of undefined — still recovers via the second call", () => {
      const result = scoreToolRouting(
        [
          call(
            "list-career-stories",
            { competencies: ["problem-solving", "technical-judgment"] },
            [],
          ),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(1);
    });

    it("exact-match first call, unparseable (undefined-citations) result, valid supporting-match recovery call — scores 1", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }),
          call("list-career-stories", { competencies: ["technical-judgment"] }, [sapCitation]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(1);
    });

    it("IMPORTANT correction: an EXACT-MATCH first call with no usable citations must NOT win over a later evidenced recovery call — the exact-match call alone would fail (no evidence), so the later call must be selected instead", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["risk-management"] }),
          call("list-career-stories", { competencies: ["risk-management"] }, [sapCitation]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(1);
    });

    it("still scores 0 when the recovery call's competency filter is invalid (uncontrolled vocabulary), even though it retrieves and cites the acceptable story", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["SAP"] }, [sapCitation]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it("still scores 0 when the recovery call returns only a non-acceptable story", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            { entityType: "story", entityId: "unrelated-story" },
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(0);
    });

    it("still scores 0 when the final answer cites a story no call returned (citesUnreturnedStory guard survives recovery)", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `${sapAnswer} [cite:story:unreturned-story]`,
        },
      );
      expect(result.score).toBe(0);
    });

    it("still scores 0 when NEITHER call qualifies (no recovery available) — falls back to the first call's own failure", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call(
            "list-career-stories",
            { competencies: ["problem-solving", "technical-judgment"] },
            [],
          ),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(0);
    });

    it("preserves the first-list-vs-search ordering guard: a search-career call before the FIRST list-career-stories call still fails, regardless of a later recovery call", () => {
      const result = scoreToolRouting(
        [
          call("search-career", { query: "financial discrepancy" }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/precede|before|first|order/i);
    });

    it("still scores 0 when the final answer reaches a no-evidence/absence conclusion (list-only route cannot license absence, even with a recovered citation)", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: `There is no matching story for that. [cite:story:${sapStoryId}]`,
        },
      );
      expect(result.score).toBe(0);
    });

    it("mirror on the alternate route (expected search-career-story-scoped, list-career-stories used as the alternate): recovers via the later valid call", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", {
            competencies: ["problem-solving", "technical-judgment"],
            query: "financial discrepancy data",
          }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "search-career-story-scoped",
        { acceptableStoryIds: [sapStoryId], answer: sapAnswer },
      );
      expect(result.score).toBe(1);
    });

    it("mirror on the alternate route: still scores 0 when the recovery call's filter is invalid", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["SAP"] }, [sapCitation]),
        ],
        "search-career-story-scoped",
        { acceptableStoryIds: [sapStoryId], answer: sapAnswer },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/competenc/i);
    });

    it("the pass/fail reason names the 1-based index of the call actually evaluated — the recovery call (#2), not the first one", () => {
      const result = scoreToolRouting(
        [
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }),
          call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] }, [
            sapCitation,
          ]),
        ],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(1);
      expect(result.reason).toMatch(/call #2|call 2|index 2|\(#2\)/i);
    });

    it("the failure reason names the 1-based index of the (first, no-recovery-available) call it evaluated", () => {
      const result = scoreToolRouting(
        [call("list-career-stories", { competencies: ["problem-solving", "technical-judgment"] })],
        "list-career-stories",
        {
          expectedCompetencies: ["risk-management"],
          acceptableStoryIds: [sapStoryId],
          answer: sapAnswer,
        },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/call #1|call 1|index 1|\(#1\)/i);
    });
  });
});
