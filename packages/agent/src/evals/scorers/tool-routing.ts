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
  const fetchCall = listCareerStoriesIndex === -1 ? undefined : toolCalls[listCareerStoriesIndex];
  const fetchedId = (fetchCall?.args as Record<string, unknown> | null)?.id;
  const scopedIds = new Set(storyScopedCitations.map((citation) => citation.entityId));
  if (typeof fetchedId !== "string" || !scopedIds.has(fetchedId)) {
    return {
      score: clampScore(0),
      reason:
        "The list-career-stories fetch's id did not match any story citation the " +
        `story-scoped search-career call returned; tool-call trace was: ${trace}.`,
    };
  }

  // #307 third independent-review correction (repro 4): merely issuing the
  // fetch call with a matching `id` argument is not proof it actually
  // returned that story — a confirmed (non-`undefined`) result must itself
  // include the fetched id. `undefined` (unparseable/unknown, same leniency
  // as elsewhere in this file) is not treated as a violation, but a
  // confirmed result that does NOT include the id — including a confirmed
  // empty `[]` — is.
  const fetchedCitations = fetchCall?.citations;
  if (
    fetchedCitations !== undefined &&
    !fetchedCitations.some((citation) => citation.entityId === fetchedId)
  ) {
    return {
      score: clampScore(0),
      reason:
        `The list-career-stories fetch's own result did not confirm retrieving "${fetchedId}", ` +
        `the story the story-scoped search returned; tool-call trace was: ${trace}.`,
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

/**
 * #307 second independent-review correction (finding 1, repro 2): a
 * `list-career-stories` call's own CONFIRMED citations (`call.citations !==
 * undefined` — see `ToolCall`'s doc: `undefined` is "unavailable/unknown"
 * and stays unchecked, the same leniency `scoreStoryScoped` already applies)
 * must actually contain every story the final answer cites — otherwise
 * `scoreListCareerStories` passed a run purely on tool presence/arguments
 * while the answer cited a story the tool never returned (including a
 * confirmed-empty `[]` result). Returns `true` (a violation) only when
 * `answer` and confirmed `citations` are both present and a cited story id
 * is missing from them.
 */
function citesUnreturnedStory(
  answer: string | undefined,
  citations: readonly ReturnedCitation[] | undefined,
): boolean {
  if (answer === undefined || citations === undefined) return false;
  const returnedIds = new Set(citations.map((citation) => citation.entityId));
  return parseCitations(answer).some(
    (marker) => marker.entityType === "story" && !returnedIds.has(marker.entityId),
  );
}

/**
 * #307 third independent-review correction (repro 3): when the case names
 * acceptable story ids, `citations` being `undefined` (unparseable result)
 * or `[]` (confirmed empty) cannot establish that a call actually retrieved
 * one of them — regardless of what the final answer claims to cite. Returns
 * `true` only when a confirmed citation both is acceptable (`acceptableStoryIds
 * === undefined` means "no restriction known" — any confirmed, cited story
 * qualifies) and is cited by `answer`.
 */
function confirmsAcceptableCitedStory(
  citations: readonly ReturnedCitation[] | undefined,
  answer: string | undefined,
  acceptableStoryIds: readonly string[] | undefined,
): boolean {
  const confirmedCitations = citations ?? [];
  const answerMarkers = parseCitations(answer ?? "");
  return confirmedCitations.some(
    (citation) =>
      (acceptableStoryIds === undefined || acceptableStoryIds.includes(citation.entityId)) &&
      answerMarkers.some(
        (marker) =>
          marker.entityType === citation.entityType && marker.entityId === citation.entityId,
      ),
  );
}

function scoreListCareerStories(
  toolCalls: readonly ToolCall[],
  expectedCompetencies: readonly string[] | undefined,
  answer: string | undefined,
  acceptableStoryIds: readonly string[] | undefined,
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

  const located = toolCalls[listCareerStoriesIndex];

  if (expectedCompetencies !== undefined && expectedCompetencies.length > 0) {
    if (located === undefined || !hasAllCompetencies(located.args, expectedCompetencies)) {
      return {
        score: clampScore(0),
        reason:
          `Expected the list-career-stories call's competencies argument to contain ` +
          `${JSON.stringify(expectedCompetencies)}; tool-call trace was: ${trace}.`,
      };
    }
  }

  if (citesUnreturnedStory(answer, located?.citations)) {
    return {
      score: clampScore(0),
      reason:
        "The final answer cites a story that the list-career-stories call's own returned " +
        `citations do not include; tool-call trace was: ${trace}.`,
    };
  }

  // #307 third independent-review correction (repro 2): a list-only route
  // has no search step, so it can never honestly ground a semantic
  // no-evidence/absence conclusion — that requires an empty or unavailable
  // story-scoped search-career call first (`scoreStoryScoped`'s own honesty
  // gate), which by construction did not run when this scorer applies. See
  // `scoreToolRouting`'s route-selection doc.
  if (answer !== undefined && NO_DIRECT_STORY_REGEX.test(answer)) {
    return {
      score: clampScore(0),
      reason:
        "The final answer reaches a semantic no-evidence/absence conclusion, which requires " +
        "an empty or unavailable story-scoped search-career call first; list-career-stories " +
        `alone cannot license it; tool-call trace was: ${trace}.`,
    };
  }

  if (
    acceptableStoryIds !== undefined &&
    !confirmsAcceptableCitedStory(located?.citations, answer, acceptableStoryIds)
  ) {
    return {
      score: clampScore(0),
      reason:
        "The list-career-stories call's own confirmed citations did not include an " +
        "acceptable story id that the final answer also cites; tool-call trace was: " +
        `${trace}.`,
    };
  }

  return {
    score: clampScore(1),
    reason: `list-career-stories was called first, ahead of search-career; tool-call trace was: ${trace}.`,
  };
}

/** Whether `call` is the story-scoped `search-career` route (as opposed to `list-career-stories`) — see `scoreStoryRoute`'s doc. */
function isStoryScopedSearchCall(call: ToolCall): boolean {
  return call.toolName === "search-career" && hasStorySourceType(call.args);
}

/**
 * #307 second independent-review correction (finding 1, repro 3), further
 * corrected under the third independent review: an ALTERNATE story-scoped
 * search used in place of a case's own `list-career-stories` route must
 * satisfy `scoreStoryScoped`'s FULL semantics (order, non-empty-fetch,
 * fallback-honesty) — not a citations-only shortcut — and, only when it
 * actually retrieved a non-empty result (`confirmedNonEmpty`; an
 * empty/unavailable result is an honest absence with nothing to cite), the
 * final answer must cite a confirmed story that is acceptable for the case
 * (`acceptableStoryIds` undefined means "any confirmed, cited story is
 * acceptable" — see `confirmsAcceptableCitedStory`).
 */
function scoreStoryScopedAsAlternate(
  toolCalls: readonly ToolCall[],
  answer: string | undefined,
  acceptableStoryIds: readonly string[] | undefined,
): ScoreResult {
  const base = scoreStoryScoped(toolCalls, answer ?? "");
  if (base.score !== 1) return base;

  const storyScopedIndex = toolCalls.findIndex((call) => isStoryScopedSearchCall(call));
  const confirmedNonEmpty = (toolCalls[storyScopedIndex]?.citations ?? []).length > 0;
  if (!confirmedNonEmpty) return base;

  const listCall = toolCalls.find((call) => call.toolName === "list-career-stories");
  if (!confirmsAcceptableCitedStory(listCall?.citations, answer, acceptableStoryIds)) {
    return {
      score: clampScore(0),
      reason:
        "The story-scoped search (used as the alternate route) retrieved a story, but the " +
        "final answer did not cite an acceptable, confirmed story; tool-call trace was: " +
        `${traceOf(toolCalls)}.`,
    };
  }
  return base;
}

/**
 * The mirror of `scoreStoryScopedAsAlternate`: an ALTERNATE `list-career-
 * stories` call used in place of a case's own story-scoped-search route
 * must satisfy `scoreListCareerStories`'s full semantics AND (always, not
 * only when `acceptableStoryIds` is known) actually cite a confirmed story —
 * a call made but never cited (#307 second independent-review repro,
 * finding 1's original counterexample) does not demonstrate the equivalent
 * behavior the either-route decision requires.
 */
function scoreListCareerStoriesAsAlternate(
  toolCalls: readonly ToolCall[],
  answer: string | undefined,
  acceptableStoryIds: readonly string[] | undefined,
): ScoreResult {
  const base = scoreListCareerStories(toolCalls, undefined, answer, acceptableStoryIds);
  if (base.score !== 1) return base;

  const located = toolCalls.find((call) => call.toolName === "list-career-stories");
  if (!confirmsAcceptableCitedStory(located?.citations, answer, acceptableStoryIds)) {
    return {
      score: clampScore(0),
      reason:
        "list-career-stories (used as the alternate route) was called, but the final answer " +
        "did not cite an acceptable, confirmed story; tool-call trace was: " +
        `${traceOf(toolCalls)}.`,
    };
  }
  return base;
}

/**
 * #307 owner-approved decision 1: "A correct behavioral answer may use
 * either list-career-stories or story-scoped search when it retrieves and
 * cites an acceptable story." Corrected under the third independent review:
 * which of the two tools was actually used decides which route's full
 * semantics apply — a story-scoped `search-career` call anywhere in the
 * trace always means the story-scoped route was taken (its own order/fetch/
 * fallback-honesty checks are never bypassable), otherwise `list-career-
 * stories` decides. When the tool actually used differs from `expected`,
 * the "AsAlternate" wrapper for that tool additionally requires an honest,
 * confirmed, acceptable citation (`scoreStoryScopedAsAlternate` /
 * `scoreListCareerStoriesAsAlternate`) — the exception #307 decision 1
 * describes, not a bypass of either route's own rules. When NEITHER tool
 * appears in the trace at all, `expected`'s own scorer runs anyway, for its
 * more specific "never called" failure reason.
 */
function scoreStoryRoute(
  toolCalls: readonly ToolCall[],
  expected: EvalCaseExpectedToolCall,
  options?: {
    expectedCompetencies?: readonly string[];
    answer?: string;
    acceptableStoryIds?: readonly string[];
  },
): ScoreResult {
  const answer = options?.answer;
  const acceptableStoryIds = options?.acceptableStoryIds;
  const usedStoryScoped = toolCalls.some((call) => isStoryScopedSearchCall(call));
  const usedListOnly =
    !usedStoryScoped && toolCalls.some((call) => call.toolName === "list-career-stories");

  if (expected === "search-career-story-scoped") {
    return usedListOnly
      ? scoreListCareerStoriesAsAlternate(toolCalls, answer, acceptableStoryIds)
      : scoreStoryScoped(toolCalls, answer ?? "");
  }

  return usedStoryScoped
    ? scoreStoryScopedAsAlternate(toolCalls, answer, acceptableStoryIds)
    : scoreListCareerStories(toolCalls, options?.expectedCompetencies, answer, acceptableStoryIds);
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
 * finding 2) applies only on the list-only route: the located call must
 * also come BEFORE any `search-career` call, and — when supplied — its
 * `competencies` argument must contain every listed value.
 *
 * ## Either-route acceptance (#307 owner-approved decision 1, corrected
 * under the third independent review)
 *
 * "A correct behavioral answer may use either list-career-stories or
 * story-scoped search when it retrieves and cites an acceptable story." For
 * `"search-career-story-scoped"` and `"list-career-stories"` alike,
 * `scoreStoryRoute` decides which of the two routes was actually taken from
 * the trace itself (never from `expected` — see its own doc) and applies
 * that route's full scorer, so the alternate route is held to the exact
 * same order/fetch/absence-honesty rules as the case's own route, not a
 * lighter-weight citation-only check.
 */
export function scoreToolRouting(
  toolCalls: readonly ToolCall[],
  expected: EvalCaseExpectedToolCall,
  options?: {
    expectedCompetencies?: readonly string[];
    answer?: string;
    acceptableStoryIds?: readonly string[];
  },
): ScoreResult {
  if (expected === "search-career-story-scoped" || expected === "list-career-stories") {
    return scoreStoryRoute(toolCalls, expected, options);
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
