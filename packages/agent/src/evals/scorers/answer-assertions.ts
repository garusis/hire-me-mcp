/**
 * Answer-assertions scorer (#300, #295's factual boundaries): checks an
 * answer's text against the case's declared `mustMatch` / `mustNotMatch`
 * regular-expression sources (`../dataset/schema.ts`'s
 * `answerAssertionsSchema`). This is how the dataset pins down *content*
 * boundaries the other scorers cannot see — that the document-extraction
 * work is called a proof of concept and never "30% to 87%", that a story's
 * actions are never transferred to a related employer, that an
 * owner-estimated figure is never presented as a measured rate.
 *
 * Pure and deterministic like every other scorer: the score is the fraction
 * of declared assertions that held, and the reason names each failure so a
 * report reader sees exactly which boundary was crossed.
 */

import type { EvalCaseAnswerAssertions } from "../dataset/schema.js";
import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

/** Score `answer` against `assertions`: 1 when every pattern holds, proportionally lower per failed assertion. */
export function scoreAnswerAssertions(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): ScoreResult {
  const failures: string[] = [];
  let total = 0;

  for (const source of assertions.mustMatch ?? []) {
    total += 1;
    if (!new RegExp(source, "i").test(answer)) {
      failures.push(`missing required pattern /${source}/i`);
    }
  }
  for (const source of assertions.mustNotMatch ?? []) {
    total += 1;
    if (new RegExp(source, "i").test(answer)) {
      failures.push(`forbidden pattern matched /${source}/i`);
    }
  }

  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} answer assertion(s) held.`
      : `${passed}/${total} answer assertion(s) held; ${failures.join("; ")}.`;

  return { score: clampScore(total === 0 ? 1 : passed / total), reason };
}
