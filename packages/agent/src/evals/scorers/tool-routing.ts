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

function scoreStoryScoped(toolCalls: readonly ToolCall[]): ScoreResult {
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
  const storyScopedCitations = toolCalls[storyScopedIndex]?.citations;
  const confirmedNonEmpty = (storyScopedCitations?.length ?? 0) > 0;
  if (confirmedNonEmpty && listCareerStoriesIndex === -1) {
    return {
      score: clampScore(0),
      reason:
        "The story-scoped search-career call returned a non-empty story result but no " +
        "list-career-stories fetch of the complete story followed; tool-call trace was: " +
        `${trace}.`,
    };
  }

  return {
    score: clampScore(1),
    reason:
      `The story-scoped search-career call (sourceTypes: ["story"]) preceded any ` +
      `list-career-stories fetch, no broader search-career call preceded it, and ${
        confirmedNonEmpty
          ? "its non-empty result was followed by a complete-story fetch"
          : "its empty/unavailable result required no fetch"
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
 *   follows it; else 0. See module docs.
 *
 * `options.expectedCompetencies` (#294 independent-review correction,
 * finding 2) applies only when `expected === "list-career-stories"`: the
 * located call must also come BEFORE any `search-career` call, and — when
 * supplied — its `competencies` argument must contain every listed value.
 */
export function scoreToolRouting(
  toolCalls: readonly ToolCall[],
  expected: EvalCaseExpectedToolCall,
  options?: { expectedCompetencies?: readonly string[] },
): ScoreResult {
  if (expected === "search-career-story-scoped") {
    return scoreStoryScoped(toolCalls);
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
