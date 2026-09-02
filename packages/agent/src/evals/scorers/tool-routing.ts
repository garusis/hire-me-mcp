/**
 * Tool-routing scorer (#75, epic #6): the hybrid-behavior locked decision —
 * deterministic tools stay the precision baseline for exact questions,
 * `search-career` covers fuzzy/cross-cutting ones — is asserted directly
 * against the run's actual tool-call trace, not inferred from the answer's
 * wording. A dataset case opts in via `EvalCase.expectedToolCall`
 * (`../dataset/schema.ts`); most existing cases leave it unset and this
 * scorer is simply not applied to them (see `../runner.ts`).
 *
 * Pure and deterministic, same as the other three scorers: given the list
 * of tool names the run actually called (`../cli.ts`'s
 * `extractToolNamesFromToolResults`), no model call, no I/O.
 */

import type { EvalCaseExpectedToolCall } from "../dataset/schema.js";
import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

/**
 * Score whether `toolCallNames` — every tool name called during one eval
 * case's real agent run — matches `expected`:
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
 */
export function scoreToolRouting(
  toolCallNames: readonly string[],
  expected: EvalCaseExpectedToolCall,
): ScoreResult {
  const calledSearchCareer = toolCallNames.includes("search-career");
  const calledListCareerStories = toolCallNames.includes("list-career-stories");
  const passed =
    expected === "search-career"
      ? calledSearchCareer
      : expected === "list-career-stories"
        ? calledListCareerStories
        : !calledSearchCareer;
  const trace = toolCallNames.length > 0 ? toolCallNames.join(", ") : "(no tool calls)";

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
