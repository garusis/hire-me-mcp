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

type CitationRef = { entityType: string; entityId: string };

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
 * Failure messages for every `conditionalMustMatch` entry that APPLIES this
 * turn (#295 third-independent-review correction, finding 1) — a required
 * caveat pattern is only checked, and only counted toward `total`, when the
 * answer actually cites `ifCitedRef`; an entry whose ref was never cited
 * (an `any` case truthfully answering with a different acceptable story)
 * contributes nothing, neither a pass nor a failure.
 */
function checkConditionalMustMatch(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
): { failures: string[]; total: number } {
  const entries = assertions.conditionalMustMatch ?? [];
  const answerMarkers = parseCitations(answer);
  const failures: string[] = [];
  let total = 0;

  for (const entry of entries) {
    if (!citationPresent(answerMarkers, entry.ifCitedRef)) continue;
    total += 1;
    if (!new RegExp(entry.pattern, "i").test(answer)) {
      failures.push(
        `missing required caveat /${entry.pattern}/i for cited ` +
          `${entry.ifCitedRef.entityType}:${entry.ifCitedRef.entityId}`,
      );
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
 *
 * #295 correction (independent Codex review, agent package `1dd7ac7`,
 * finding 4): the preference check is a SECOND, independent pass condition
 * that fails only when the preferred source was actually returned by a tool
 * THAT TURN (`toolReturnedRefs`, from the run's `toolCitations` — what a
 * tool call in this run actually surfaced, not what the answer cites). A
 * preferred source that was never returned was never available to cite, so
 * citing an honest acceptable alternative instead cannot be a preference
 * failure — the group's `any`/`all` membership check above is unaffected
 * either way; only the extra preference check is gated on availability.
 */
function checkCitationGroup(
  answerMarkers: readonly { entityType: string; entityId: string }[],
  group: EvalCaseCitationGroup,
  toolReturnedRefs: readonly { entityType: string; entityId: string }[],
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
  if (preferred !== undefined && citationPresent(toolReturnedRefs, preferred)) {
    const preferredLabel = `${preferred.entityType}:${preferred.entityId}`;
    if (cited[0] !== preferredLabel) {
      return `cited ${cited[0]} instead of the preferred citation ${preferredLabel} from [${groupLabel}], which a tool returned this turn`;
    }
  }
  return null;
}

/** Failure messages for every `citationGroups` entry that didn't hold, plus how many were checked (one unit per group). */
function checkCitationGroups(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
  toolCitations: readonly { entityType: string; entityId: string }[],
): { failures: string[]; total: number } {
  const groups = assertions.citationGroups ?? [];
  const answerMarkers = parseCitations(answer);
  const failures = groups
    .map((group) => checkCitationGroup(answerMarkers, group, toolCitations))
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
 *
 * `toolCitations` (#295 correction, finding 4) is the one exception: a
 * `citationGroups` entry's `preferredRef` check DOES need to know what a
 * tool returned this turn, specifically to tell "preferred was available
 * and passed over" apart from "preferred was never available" — see
 * `checkCitationGroup`'s doc comment. Defaults to an empty array so
 * existing callers with no preference-declaring cases keep compiling.
 */
export function scoreAnswerAssertions(
  answer: string,
  assertions: EvalCaseAnswerAssertions,
  toolCitations: readonly { entityType: string; entityId: string }[] = [],
): ScoreResult {
  const text = checkTextPatterns(answer, assertions);
  const citations = checkCitationRefs(answer, assertions);
  const groups = checkCitationGroups(answer, assertions, toolCitations);
  const conditional = checkConditionalMustMatch(answer, assertions);
  const failures = [
    ...text.failures,
    ...citations.failures,
    ...groups.failures,
    ...conditional.failures,
  ];
  const total = text.total + citations.total + groups.total + conditional.total;

  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} answer assertion(s) held.`
      : `${passed}/${total} answer assertion(s) held; ${failures.join("; ")}.`;

  return { score: clampScore(total === 0 ? 1 : passed / total), reason };
}

/**
 * Independent preferred-source compliance score (#295 second independent
 * Codex review, agent package `34b28c5`, finding 4): a `citationGroups`
 * preference failure MUST block the eval verdict on its own, not merely
 * dilute the blended `scoreAnswerAssertions` fraction — that fraction can
 * always be diluted by other passing assertions in the same case, or
 * averaged away across other passing cases in the report's aggregate. This
 * mirrors the retrieval package's own independent `preferredSourceCompliance`
 * fix: `../report.ts` feeds this into its own aggregate, gated by a blocking
 * (1.0) threshold in `../thresholds.ts`, separate from `answerAssertions`.
 *
 * Returns `null` when the case declares no `citationGroups` entry with a
 * `preferredRef` at all — there is nothing to hold this case's report to,
 * same optional-aggregate treatment as `toolRouting`/`answerAssertions`
 * (`../thresholds.ts`). Otherwise scores the fraction of preference-
 * declaring groups whose preference held: a group's preference holds unless
 * the preferred source was returned by a tool THAT TURN
 * (`toolReturnedRefs`) and the answer's single acceptable citation for that
 * group is not it — a preferred source never returned was never available
 * to cite, so citing an honest acceptable alternative instead cannot be a
 * preference failure (the passing branch `checkCitationGroup` already
 * preserves).
 */
export function scorePreferredSourceCompliance(
  answer: string,
  assertions: EvalCaseAnswerAssertions | undefined,
  toolReturnedRefs: readonly CitationRef[],
): ScoreResult | null {
  const groups = (assertions?.citationGroups ?? []).filter(
    (group): group is EvalCaseCitationGroup & { preferredRef: CitationRef } =>
      group.preferredRef !== undefined,
  );
  if (groups.length === 0) return null;

  const answerMarkers = parseCitations(answer);
  const outcomes = groups.map((group) => {
    const preferredLabel = `${group.preferredRef.entityType}:${group.preferredRef.entityId}`;
    const preferredWasReturned = citationPresent(toolReturnedRefs, group.preferredRef);
    const preferredWasCited = citationPresent(answerMarkers, group.preferredRef);
    const failed = preferredWasReturned && !preferredWasCited;
    return {
      failed,
      message: failed
        ? `preferred source ${preferredLabel} was returned this turn but not cited`
        : null,
    };
  });

  const failures = outcomes.filter((outcome) => outcome.failed).map((outcome) => outcome.message);
  const passed = outcomes.length - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${outcomes.length} preferred-source group(s) complied.`
      : `${passed}/${outcomes.length} preferred-source group(s) complied; ${failures.join("; ")}.`;

  return { score: clampScore(passed / outcomes.length), reason };
}

/**
 * Independent factual-boundary compliance score (#295 third-independent-
 * review correction, finding 1): "Factual-boundary violations are detected
 * but still do not fail the eval... a run containing one such case
 * therefore still passes." `scoreAnswerAssertions`'s blended fraction can
 * always be diluted by other passing assertions in the SAME case, or
 * averaged away across other passing cases in the report's aggregate — the
 * exact review counterexample scores a diluted `0.8`, equal to the
 * committed threshold, so it still passes. This scorer re-checks the same
 * `mustMatch`/`mustNotMatch`/`conditionalMustMatch` text-and-caveat
 * assertions (never `mustCiteEntity`/`citationGroups`, which are grounding/
 * routing checks with their own dedicated treatment) as one BINARY
 * pass/fail per case: any single violation fails the case outright,
 * mirroring `scorePreferredSourceCompliance`'s blocking treatment and fed
 * into its own blocking (1.0) `../thresholds.ts` aggregate by `../report.ts`
 * so a factual-boundary regression cannot hide behind an otherwise-healthy
 * average.
 *
 * Returns `null` when the case declares no `mustMatch`/`mustNotMatch`/
 * `conditionalMustMatch` entry at all (e.g. a case whose `answerAssertions`
 * is purely `mustCiteEntity`/`citationGroups`) — there is no factual
 * boundary declared for this case to hold, same optional-aggregate
 * treatment the other scorers in this module use.
 */
export function scoreFactualBoundaryCompliance(
  answer: string,
  assertions: EvalCaseAnswerAssertions | undefined,
): ScoreResult | null {
  if (!assertions) return null;
  const hasBoundaryAssertions =
    (assertions.mustMatch?.length ?? 0) > 0 ||
    (assertions.mustNotMatch?.length ?? 0) > 0 ||
    (assertions.conditionalMustMatch?.length ?? 0) > 0;
  if (!hasBoundaryAssertions) return null;

  const text = checkTextPatterns(answer, assertions);
  const conditional = checkConditionalMustMatch(answer, assertions);
  const failures = [...text.failures, ...conditional.failures];
  const total = text.total + conditional.total;
  const passed = total - failures.length;
  const reason =
    failures.length === 0
      ? `${passed}/${total} factual-boundary assertion(s) held.`
      : `${passed}/${total} factual-boundary assertion(s) held; ${failures.join("; ")}.`;

  return { score: failures.length === 0 ? 1 : 0, reason };
}
