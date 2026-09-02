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
import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

/** One real tool call captured during an eval run — see `./types.js`'s module doc for the fuller rationale. */
export interface ToolCall {
  toolName: string;
  args: unknown;
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
  const passed = listCareerStoriesIndex === -1 || storyScopedIndex < listCareerStoriesIndex;
  return {
    score: clampScore(passed ? 1 : 0),
    reason: passed
      ? `The story-scoped search-career call (sourceTypes: ["story"]) preceded any ` +
        `list-career-stories fetch; tool-call trace was: ${trace}.`
      : "Expected the story-scoped search-career call to precede the list-career-stories " +
        `fetch it feeds (order violation); tool-call trace was: ${trace}.`,
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
 *   was called with `sourceTypes` including `"story"`, AND that call
 *   precedes any `list-career-stories` call in the trace (or no such call
 *   exists); else 0. See module docs.
 */
export function scoreToolRouting(
  toolCalls: readonly ToolCall[],
  expected: EvalCaseExpectedToolCall,
): ScoreResult {
  if (expected === "search-career-story-scoped") {
    return scoreStoryScoped(toolCalls);
  }

  const calledSearchCareer = toolCalls.some((call) => call.toolName === "search-career");
  const calledListCareerStories = toolCalls.some((call) => call.toolName === "list-career-stories");
  const passed =
    expected === "search-career"
      ? calledSearchCareer
      : expected === "list-career-stories"
        ? calledListCareerStories
        : !calledSearchCareer;
  const trace = traceOf(toolCalls);

  const reason =
    expected === "search-career"
      ? `Expected search-career to be called; tool-call trace was: ${trace}.`
      : expected === "list-career-stories"
        ? `Expected list-career-stories to be called; tool-call trace was: ${trace}.`
        : `Expected search-career NOT to be called (deterministic tools only); tool-call trace was: ${trace}.`;

  return {
    score: clampScore(passed ? 1 : 0),
    reason,
  };
}
