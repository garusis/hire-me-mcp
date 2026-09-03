/**
 * Tool-routing scorer (#75, epic #6): the hybrid-behavior locked decision —
 * deterministic tools stay the precision baseline for exact questions,
 * `search-career` covers fuzzy/cross-cutting ones — is asserted directly
 * against the run's actual tool-call trace, not inferred from the answer's
 * wording. A dataset case opts in via `EvalCase.expectedToolCall`
 * (`../dataset/schema.js`); most existing cases leave it unset and this
 * scorer is simply not applied to them (see `../runner.js`).
 *
 * Pure and deterministic, same as the other three scorers: given the list
 * of real tool calls made during the run (`../cli.js`'s
 * `extractToolCallsFromToolResults`), no model call, no I/O.
 *
 * ## `search-career-story-scoped` (#294 independent-review correction)
 *
 * A name-only trace (`toolCallNames: string[]`) cannot tell "search-career
 * was called" from "search-career was called with `sourceTypes: ['story']`"
 * — the #305 decision 5 locked route for fuzzy behavioral wording
 * specifically requires the latter, fetched BEFORE any complete-story
 * `list-career-stories` call. This scorer now takes the full `{ toolName,
 * args }` trace so it can check both the argument and the sequence, not
 * just tool-name presence.
 */

import { parseCitations } from "../../citations.js";
import type { EvalCaseExpectedToolCall } from "../dataset/schema.js";
import type { ReturnedCitation, ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

/**
 * One real tool call captured during an eval run — see `./types.js`'s
 * module doc for the fuller rationale. `citations` (#294 independent-review
 * correction, finding 1) is the `DomainResult.citations` that specific call
 * actually returned — `undefined` when the tool result's shape didn't parse
 * (treated as "unavailable/unknown", the same as an honest empty result: no
 * complete-story fetch is required off it), an empty array for a confirmed
 * empty result, and a non-empty array for a confirmed match. Populated by
 * `../cli.ts`'s `extractToolCallsFromToolResults` for real runs.
 */
export interface ToolCall {
  toolName: string;
  args: unknown;
  citations?: ReturnedCitation[];
}

/** Whether `args` is an object whose `sourceTypes` array includes `"story"` — the fuzzy-behavioral route's required search-career input (#294, #305 decision 5). */
function hasStorySourceType(args: unknown): boolean {
  if (typeof args !== "object" || args === null) return false;
  const sourceTypes = (args as Record<string, unknown>).sourceTypes;
  return Array.isArray(sourceTypes) && sourceTypes.includes("story");
}

function traceOf(toolCalls: readonly ToolCall[]): string {
  return toolCalls.length > 0
    ? toolCalls.map((call) => call.toolName).join(", ")
    : "(no tool calls)";
}

/** Whether `call` is a `search-career` call that is NOT scoped to `sourceTypes: ["story"]` — the "broader" fallback search #305 decision 5 allows only after an honest empty/unavailable scoped result. */
function isBroaderSearch(call: ToolCall): boolean {
  return call.toolName === "search-career" && !hasStorySourceType(call.args);
}

/**
 * The system prompt's exact fallback-honesty contract
 * (`../../prompt/sections.ts`): "say plainly that no direct story supports
 * the requested behavior" and "label it explicitly as related evidence, not
 * a behavioral event." Fourth #294 independent-review correction: an
 * empty/unavailable story-scoped result followed by a broader fallback
 * search used to score 1 regardless of what the final answer said, letting
 * a recommendation/experience result stand in silently for the requested
 * behavioral event. Both phrases below must appear in the answer for that
 * fallback to be honest.
 */
/**
 * #307 owner-approved decision 3: "Honest semantic equivalents of no direct
 * story are valid; no literal phrase lock." The prior pattern recognized
 * only "no direct/specific story"-shaped sentences; a real gap answer
 * observed in the 66-case run ("The career records do not contain an
 * account of...") states the same absence differently and was wrongly
 * treated as dishonest. Exported (as a source string, not a compiled
 * RegExp) so `../dataset/story-manifest-cases.ts`'s N01/N02 `mustMatch`
 * assertions share this same broadened wording instead of maintaining a
 * second, narrower copy that could drift out of sync.
 */
export const ABSENT_STORY_PATTERN =
  "no (?:direct|specific|matching) story|" +
  "doesn'?t have a (?:direct|specific|matching) story|" +
  "hasn'?t (?:got|captured) a (?:direct|specific|matching) story|" +
  "(?:career records?|records?) (?:do|does) not (?:contain|include|have|show) (?:an? )?" +
  "(?:direct |specific |matching )?(?:account|story|record|example) of|" +
  "hasn'?t done (?:a|that|this|an?) [a-z ]{0,40}where";

const NO_DIRECT_STORY_REGEX = new RegExp(ABSENT_STORY_PATTERN, "i");
const RELATED_EVIDENCE_LABEL_REGEX =
  /(related|closest)( grounded| available)? evidence|not (itself )?a behavioral event/i;

/** Whether `answer` both states plainly that no direct story was found AND labels a broader fallback result as related/closest evidence rather than a behavioral event — see the regexes' doc comment. */
function labelsFallbackHonestly(answer: string): boolean {
  return NO_DIRECT_STORY_REGEX.test(answer) && RELATED_EVIDENCE_LABEL_REGEX.test(answer);
}

/**
 * Third #294 independent-review correction (finding 2): once a story-scoped
 * search has CONFIRMED a non-empty result (`storyScopedCitations`), two more
 * things must hold, checked together here to keep `scoreStoryScoped`'s
 * complexity bounded: (1) the `list-career-stories` fetch's `id` must match
 * one of the citations that scoped search actually returned — not just any
 * story — and (2) no broader (non-story-scoped) `search-career` call may
 * run anywhere after it, since #294 permits that fallback only after an
 * empty/unavailable scoped result. Returns `null` when both hold.
 */
function checkNonEmptyScopedFollowUp(
  toolCalls: readonly ToolCall[],
  storyScopedIndex: number,
  listCareerStoriesIndex: number,
  storyScopedCitations: readonly ReturnedCitation[],
  trace: string,
): ScoreResult | null {
  const fetchedId =
    listCareerStoriesIndex === -1
      ? undefined
      : (toolCalls[listCareerStoriesIndex]?.args as Record<string, unknown> | null)?.id;
  const scopedIds = new Set(storyScopedCitations.map((citation) => citation.entityId));
  if (typeof fetchedId !== "string" || !scopedIds.has(fetchedId)) {
    return {
      score: clampScore(0),
      reason:
        "The list-career-stories fetch's id did not match any story citation the " +
        `story-scoped search-career call returned; tool-call trace was: ${trace}.`,
    };
  }

  const broaderAfterIndex = toolCalls
    .slice(storyScopedIndex + 1)
    .findIndex((call) => isBroaderSearch(call));
  if (broaderAfterIndex !== -1) {
    return {
      score: clampScore(0),
      reason:
        "A broader (non-story-scoped) search-career call ran after the story-scoped " +
        "search returned a non-empty result; #294 permits the broader fallback only " +
        `after an empty/unavailable story-only result. Tool-call trace was: ${trace}.`,
    };
  }

  return null;
}

function scoreStoryScoped(toolCalls: readonly ToolCall[], answer: string): ScoreResult {
  const trace = traceOf(toolCalls);
  const storyScopedIndex = toolCalls.findIndex(
    (call) => call.toolName === "search-career" && hasStorySourceType(call.args),
  );
  if (storyScopedIndex === -1) {
    return {
      score: clampScore(0),
      reason:
        'Expected search-career to be called with sourceTypes including "story"; ' +
        `tool-call trace was: ${trace}.`,
    };
  }

  const listCareerStoriesIndex = toolCalls.findIndex(
    (call) => call.toolName === "list-career-stories",
  );
  const orderOk = listCareerStoriesIndex === -1 || storyScopedIndex < listCareerStoriesIndex;
  if (!orderOk) {
    return {
      score: clampScore(0),
      reason:
        "Expected the story-scoped search-career call to precede the list-career-stories " +
        `fetch it feeds (order violation); tool-call trace was: ${trace}.`,
    };
  }

  // #294 independent-review correction (finding 1): a broader, non-story-
  // scoped search-career call is only an honest fallback when it follows the
  // scoped call — one that precedes it means the fuzzy route never actually
  // tried the story-only search first.
  const broaderBeforeIndex = toolCalls
    .slice(0, storyScopedIndex)
    .findIndex((call) => isBroaderSearch(call));
  if (broaderBeforeIndex !== -1) {
    return {
      score: clampScore(0),
      reason:
        'Expected the story-scoped search-career call (sourceTypes: ["story"]) to run ' +
        "before any broader search-career fallback, not after; tool-call trace was: " +
        `${trace}.`,
    };
  }

  // #294 independent-review correction (finding 1): a name-and-args-only
  // trace couldn't distinguish "the scoped search found a story" from "it
  // found nothing" — `citations` (populated from the real DomainResult) now
  // makes that distinction. `undefined` (unparseable/unknown result shape)
  // is treated the same as a confirmed empty one: nothing licenses skipping
  // the fetch either way, and nothing requires it.
  const storyScopedCitations = toolCalls[storyScopedIndex]?.citations ?? [];
  const confirmedNonEmpty = storyScopedCitations.length > 0;
  if (confirmedNonEmpty && listCareerStoriesIndex === -1) {
    return {
      score: clampScore(0),
      reason:
        "The story-scoped search-career call returned a non-empty story result but no " +
        "list-career-stories fetch of the complete story followed; tool-call trace was: " +
        `${trace}.`,
    };
  }

  // Third #294 independent-review correction (finding 2): a confirmed
  // non-empty scoped result must be followed by a fetch of one of ITS OWN
  // citations, with no broader fallback anywhere after it.
  if (confirmedNonEmpty) {
    const followUpFailure = checkNonEmptyScopedFollowUp(
      toolCalls,
      storyScopedIndex,
      listCareerStoriesIndex,
      storyScopedCitations,
      trace,
    );
    if (followUpFailure) {
      return followUpFailure;
    }
  }

  // Fourth #294 independent-review correction: an empty/unavailable scoped
  // result licenses a broader fallback search, but only an HONEST one — the
  // final answer must say plainly that no direct story was found and label
  // the fallback result as related/closest evidence, not the behavioral
  // event itself. When no broader search actually ran, there is nothing to
  // label, so the answer is not checked.
  if (!confirmedNonEmpty) {
    const broaderAfterIndex = toolCalls
      .slice(storyScopedIndex + 1)
      .findIndex((call) => isBroaderSearch(call));
    if (broaderAfterIndex !== -1 && !labelsFallbackHonestly(answer)) {
      return {
        score: clampScore(0),
        reason:
          "A broader search-career call followed an empty/unavailable story-scoped result, " +
          "but the final answer did not both state plainly that no direct story was found " +
          "and label the broader result as related/closest evidence rather than a " +
          `behavioral event; tool-call trace was: ${trace}.`,
      };
    }
  }

  return {
    score: clampScore(1),
    reason:
      `The story-scoped search-career call (sourceTypes: ["story"]) preceded any ` +
      `list-career-stories fetch, no broader search-career call preceded it, and ${
        confirmedNonEmpty
          ? "its non-empty result was followed by a complete-story fetch"
          : "its empty/unavailable result required no fetch, and any broader fallback was " +
            "honestly labeled"
      }; tool-call trace was: ${trace}.`,
  };
}

/**
 * Whether `args.competencies` (an array, per the `list-career-stories` tool
 * input) contains every value in `expected` — case-sensitive, exact match.
 * #294 independent-review correction, finding 2.
 */
function hasAllCompetencies(args: unknown, expected: readonly string[]): boolean {
  if (typeof args !== "object" || args === null) return false;
  const competencies = (args as Record<string, unknown>).competencies;
  if (!Array.isArray(competencies)) return false;
  return expected.every((value) => competencies.includes(value));
}

function scoreListCareerStories(
  toolCalls: readonly ToolCall[],
  expectedCompetencies: readonly string[] | undefined,
): ScoreResult {
  const trace = traceOf(toolCalls);
  const listCareerStoriesIndex = toolCalls.findIndex(
    (call) => call.toolName === "list-career-stories",
  );
  if (listCareerStoriesIndex === -1) {
    return {
      score: clampScore(0),
      reason: `Expected list-career-stories to be called; tool-call trace was: ${trace}.`,
    };
  }

  const searchCareerIndex = toolCalls.findIndex((call) => call.toolName === "search-career");
  if (searchCareerIndex !== -1 && searchCareerIndex < listCareerStoriesIndex) {
    return {
      score: clampScore(0),
      reason:
        "Expected list-career-stories to be called first, ahead of search-career, for a " +
        `known-competency behavioral question; tool-call trace was: ${trace}.`,
    };
  }

  if (expectedCompetencies !== undefined && expectedCompetencies.length > 0) {
    const call = toolCalls[listCareerStoriesIndex];
    if (call === undefined || !hasAllCompetencies(call.args, expectedCompetencies)) {
      return {
        score: clampScore(0),
        reason:
          `Expected the list-career-stories call's competencies argument to contain ` +
          `${JSON.stringify(expectedCompetencies)}; tool-call trace was: ${trace}.`,
      };
    }
  }

  return {
    score: clampScore(1),
    reason: `list-career-stories was called first, ahead of search-career; tool-call trace was: ${trace}.`,
  };
}

/**
 * #307 owner-approved decision 1: either story-route tool
 * (`list-career-stories` or a story-scoped `search-career` call) counts as
 * a valid route when it actually retrieved a story AND the final answer
 * cites one of the entities that specific call returned. Returns `null`
 * (never a failing `ScoreResult`) when no such call exists — the caller
 * falls through to the route-specific scorer, which has its own, more
 * specific failure reason.
 */
function scoreEitherStoryRoute(toolCalls: readonly ToolCall[], answer: string): ScoreResult | null {
  const answerMarkers = parseCitations(answer);
  for (const call of toolCalls) {
    const isStoryRouteCall =
      call.toolName === "list-career-stories" ||
      (call.toolName === "search-career" && hasStorySourceType(call.args));
    if (!isStoryRouteCall) continue;

    const citations = call.citations ?? [];
    const citesAcceptable = citations.some((citation) =>
      answerMarkers.some(
        (marker) =>
          marker.entityType === citation.entityType && marker.entityId === citation.entityId,
      ),
    );
    if (citesAcceptable) {
      return {
        score: clampScore(1),
        reason:
          `${call.toolName} retrieved a story and the final answer cited it — a valid route ` +
          "under the owner-approved either-route decision (#307), regardless of which route " +
          `this case locks; tool-call trace was: ${traceOf(toolCalls)}.`,
      };
    }
  }
  return null;
}

/**
 * Score whether `toolCalls` — every tool call made during one eval case's
 * real agent run — matches `expected`:
 *
 * - `"search-career"` — scores 1 if `search-career` appears anywhere in the
 *   trace, else 0.
 * - `"list-career-stories"` (#294) — scores 1 if `list-career-stories`
 *   appears anywhere in the trace, else 0.
 * - `"deterministic-only"` — scores 1 if `search-career` does NOT appear
 *   anywhere in the trace (including an empty trace — trivially satisfied,
 *   nothing to violate), else 0. `list-career-stories` appearing does not
 *   violate this: it is a deterministic, repository-backed tool, not
 *   semantic search.
 * - `"search-career-story-scoped"` (#294) — scores 1 only if `search-career`
 *   was called with `sourceTypes` including `"story"`, that call precedes
 *   any `list-career-stories` call in the trace (or no such call exists),
 *   no broader (non-story-scoped) `search-career` call precedes it, and —
 *   when its captured `citations` (#294 independent-review correction,
 *   finding 1) confirm a non-empty result — a `list-career-stories` fetch
 *   follows it. When the result is instead empty/unavailable, a broader
 *   fallback search is allowed but only if `options.answer` (fourth #294
 *   independent-review correction) both states plainly that no direct story
 *   was found and labels the fallback as related/closest evidence rather
 *   than a behavioral event; else 0. See module docs.
 *
 * `options.expectedCompetencies` (#294 independent-review correction,
 * finding 2) applies only when `expected === "list-career-stories"`: the
 * located call must also come BEFORE any `search-career` call, and — when
 * supplied — its `competencies` argument must contain every listed value.
 *
 * ## Either-route acceptance (#307 owner-approved decision 1)
 *
 * "A correct behavioral answer may use either list-career-stories or
 * story-scoped search when it retrieves and cites an acceptable story."
 * Before falling through to the route-specific check above, both
 * `"search-career-story-scoped"` and `"list-career-stories"` first check
 * `scoreEitherStoryRoute`: whether ANY story-route tool call in the trace
 * (`list-career-stories`, or `search-career` with `sourceTypes: ["story"]`)
 * returned a non-empty `citations` list AND the final answer actually cites
 * one of those returned entities. That is route-agnostic by design — it
 * does not care which of the two tools produced the cited story, only that
 * a real result was retrieved and honestly cited — so it scores 1
 * regardless of the case's locked `expected` route. When no such
 * successful citation exists, this falls through unchanged to the
 * route-specific scorer's own (still strict) rules and its more specific
 * failure reason.
 */
export function scoreToolRouting(
  toolCalls: readonly ToolCall[],
  expected: EvalCaseExpectedToolCall,
  options?: { expectedCompetencies?: readonly string[]; answer?: string },
): ScoreResult {
  if (expected === "search-career-story-scoped" || expected === "list-career-stories") {
    const eitherRoute = scoreEitherStoryRoute(toolCalls, options?.answer ?? "");
    if (eitherRoute) return eitherRoute;
  }
  if (expected === "search-career-story-scoped") {
    return scoreStoryScoped(toolCalls, options?.answer ?? "");
  }
  if (expected === "list-career-stories") {
    return scoreListCareerStories(toolCalls, options?.expectedCompetencies);
  }

  const calledSearchCareer = toolCalls.some((call) => call.toolName === "search-career");
  const passed = expected === "search-career" ? calledSearchCareer : !calledSearchCareer;
  const trace = traceOf(toolCalls);

  const reason =
    expected === "search-career"
      ? `Expected search-career to be called; tool-call trace was: ${trace}.`
      : `Expected search-career NOT to be called (deterministic tools only); tool-call trace was: ${trace}.`;

  return {
    score: clampScore(passed ? 1 : 0),
    reason,
  };
}
