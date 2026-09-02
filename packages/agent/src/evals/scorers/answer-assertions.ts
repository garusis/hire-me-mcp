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
import type { EvalCaseAnswerAssertions, EvalCaseCitationGroup } from "../dataset/schema.js";
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

/** Which of `group.refs` are actually cited in `answerMarkers`, as `"entityType:entityId"` labels — used both to check the group and to report which ones matched. */
function citedRefLabels(
  answerMarkers: readonly { entityType: string; entityId: string }[],
  group: EvalCaseCitationGroup,
): string[] {
  return group.refs
    .filter((ref) => citationPresent(answerMarkers, ref))
    .map((ref) => `${ref.entityType}:${ref.entityId}`);
}

/**
 * One #295 `citationGroups` entry's pass/fail failure message, or `null` when
 * it holds — see `EvalCaseCitationGroup`'s doc comment (`../dataset/schema.ts`)
 * for the `any`/`all`/`preferredRef` semantics this enforces.
 */
function checkCitationGroup(
  answerMarkers: readonly { entityType: string; entityId: string }[],
  group: EvalCaseCitationGroup,
): string | null {
  const cited = citedRefLabels(answerMarkers, group);
  const groupLabel = group.refs.map((ref) => `${ref.entityType}:${ref.entityId}`).join(", ");

  if (group.mode === "all") {
    const missing = group.refs
      .filter((ref) => !citationPresent(answerMarkers, ref))
      .map((ref) => `${ref.entityType}:${ref.entityId}`);
    return missing.length === 0
      ? null
      : `cross-cutting citation group [${groupLabel}] is missing: ${missing.join(", ")}`;
  }

  // mode === "any"
  if (cited.length === 0) {
    return `did not cite any of the acceptable citations [${groupLabel}]`;
  }
  if (cited.length > 1) {
    return (
      `cited more than one of [${groupLabel}] (${cited.join(", ")}) where a single ` +
      "complete story was expected (one-story-answer semantics)"
    );
  }
  const preferred = group.preferredRef;
  if (preferred !== undefined) {
    const preferredLabel = `${preferred.entityType}:${preferred.entityId}`;
    if (cited[0] !== preferredLabel) {
      return `cited ${cited[0]} instead of the preferred citation ${preferredLabel} from [${groupLabel}]`;
    }
  }
  return null;
}

/** Failure messages for every `citationGroups` entry that didn't hold, plus how many were checked (one unit per group). */
function checkCitationGroups(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): { failures: string[]; total: number } {
  const groups = assertions.citationGroups ?? [];
  const answerMarkers = parseCitations(answer);
  const failures = groups
    .map((group) => checkCitationGroup(answerMarkers, group))
    .filter((failure): failure is string => failure !== null);
  return { failures, total: groups.length };
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
  const groups = checkCitationGroups(answer, assertions);
  const failures = [...text.failures, ...citations.failures, ...groups.failures];
  const total = text.total + citations.total + groups.total;

  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} answer assertion(s) held.`
      : `${passed}/${total} answer assertion(s) held; ${failures.join("; ")}.`;

  return { score: clampScore(total === 0 ? 1 : passed / total), reason };
}
