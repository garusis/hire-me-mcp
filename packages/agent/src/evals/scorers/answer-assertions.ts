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
import type { ReturnedCitation, ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

function citationPresent(
  toolCitations: readonly ReturnedCitation[],
  ref: { entityType: string; entityId: string },
): boolean {
  return toolCitations.some(
    (citation) => citation.entityType === ref.entityType && citation.entityId === ref.entityId,
  );
}

/** Failure messages for every `mustMatch`/`mustNotMatch` text pattern that didn't hold, plus how many were checked. */
function checkTextPatterns(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): { failures: string[]; total: number } {
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

  return { failures, total };
}

/** Failure messages for every `mustCiteEntity`/`mustNotCiteEntity` ref that didn't hold, plus how many were checked. */
function checkCitationRefs(
  toolCitations: readonly ReturnedCitation[],
  assertions: EvalCaseAnswerAssertions,
): { failures: string[]; total: number } {
  const failures: string[] = [];
  let total = 0;

  for (const ref of assertions.mustCiteEntity ?? []) {
    total += 1;
    if (!citationPresent(toolCitations, ref)) {
      failures.push(`missing required citation ${ref.entityType}:${ref.entityId}`);
    }
  }
  for (const ref of assertions.mustNotCiteEntity ?? []) {
    total += 1;
    if (citationPresent(toolCitations, ref)) {
      failures.push(`forbidden citation present ${ref.entityType}:${ref.entityId}`);
    }
  }

  return { failures, total };
}

/**
 * Score `answer` against `assertions`: 1 when every declared assertion
 * holds, proportionally lower per failed one. `mustMatch`/`mustNotMatch`
 * check the answer TEXT; `mustCiteEntity`/`mustNotCiteEntity` (#294
 * independent-review correction) check `toolCitations` — the citations the
 * run's tool calls actually returned — instead, so a required (or
 * forbidden) piece of evidence is verified against what was actually
 * fetched, not just what the answer happens to say. `toolCitations`
 * defaults to an empty array so callers that only assert on text (the
 * pre-#294 signature) keep working unchanged.
 */
export function scoreAnswerAssertions(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
  toolCitations: readonly ReturnedCitation[] = [],
): ScoreResult {
  const text = checkTextPatterns(answer, assertions);
  const citations = checkCitationRefs(toolCitations, assertions);
  const failures = [...text.failures, ...citations.failures];
  const total = text.total + citations.total;

  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} answer assertion(s) held.`
      : `${passed}/${total} answer assertion(s) held; ${failures.join("; ")}.`;

  return { score: clampScore(total === 0 ? 1 : passed / total), reason };
}
