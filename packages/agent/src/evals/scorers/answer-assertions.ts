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

import { parseCitations } from "../../citations.js";
import type { EvalCaseAnswerAssertions } from "../dataset/schema.js";
import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

function citationPresent(
  answerMarkers: readonly { entityType: string; entityId: string }[],
  ref: { entityType: string; entityId: string },
): boolean {
  return answerMarkers.some(
    (marker) => marker.entityType === ref.entityType && marker.entityId === ref.entityId,
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

/** Failure messages for every `mustCiteEntity`/`mustNotCiteEntity` ref that didn't hold against the answer's own parsed citation markers, plus how many were checked. */
function checkCitationRefs(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): { failures: string[]; total: number } {
  const failures: string[] = [];
  let total = 0;
  const answerMarkers = parseCitations(answer);

  for (const ref of assertions.mustCiteEntity ?? []) {
    total += 1;
    if (!citationPresent(answerMarkers, ref)) {
      failures.push(`missing required citation ${ref.entityType}:${ref.entityId}`);
    }
  }
  for (const ref of assertions.mustNotCiteEntity ?? []) {
    total += 1;
    if (citationPresent(answerMarkers, ref)) {
      failures.push(`forbidden citation present ${ref.entityType}:${ref.entityId}`);
    }
  }

  return { failures, total };
}

/**
 * Score `answer` against `assertions`: 1 when every declared assertion
 * holds, proportionally lower per failed one. `mustMatch`/`mustNotMatch`
 * check the answer TEXT; `mustCiteEntity`/`mustNotCiteEntity` (#294 third
 * independent-review correction) check the `[cite:...]` markers actually
 * present IN THAT TEXT (parsed with the shared `parseCitations`) — not
 * `toolCitations`, the run's flattened tool-returned citations, which a
 * tool can populate with an entity the answer never actually cites (an
 * alternative story `list-career-stories` surfaced, say). A required (or
 * forbidden) piece of evidence is verified against what the answer actually
 * cites, not what a tool call merely returned in the same run.
 */
export function scoreAnswerAssertions(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): ScoreResult {
  const text = checkTextPatterns(answer, assertions);
  const citations = checkCitationRefs(answer, assertions);
  const failures = [...text.failures, ...citations.failures];
  const total = text.total + citations.total;

  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} answer assertion(s) held.`
      : `${passed}/${total} answer assertion(s) held; ${failures.join("; ")}.`;

  return { score: clampScore(total === 0 ? 1 : passed / total), reason };
}
