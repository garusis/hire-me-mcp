/**
 * `getSkillEvidence(repository, skill)` — the fourth domain service, and the
 * one that makes the project honest. Looks a term up against both the
 * dataset's claimed `Skill`s and its explicit `Gap`s (never just "skills"),
 * using the same alias/normalization module `searchProjects` (#55) uses, and
 * returns a discriminated union with exactly three outcomes: `claimed`,
 * `not-claimed`, `unknown`. See README.md for the fully documented shape.
 */

import type { Citation, Gap, Skill } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";
import { buildAliasIndex } from "./search/alias-resolver.js";

/** A resolved, real `Skill` record together with its own resolving citations. */
export interface RelatedSkillEvidence {
  skill: Skill;
  evidence: Citation[];
}

/** The term resolves to a claimed `Skill`: its record plus resolving evidence citations. */
export interface ClaimedSkillOutcome {
  kind: "claimed";
  skill: Skill;
  evidence: Citation[];
}

/**
 * The term resolves to an explicit `Gap` — never `claimed`, never empty.
 * `gap.statement` is the authored content's own string, passed through
 * unmodified (no synthesis, no rewording). `relatedSkills` resolves the
 * gap's adjacent-skill ids to their real `Skill` records, each with its own
 * evidence citations.
 */
export interface NotClaimedGapOutcome {
  kind: "not-claimed";
  gap: Gap;
  relatedSkills: RelatedSkillEvidence[];
}

/**
 * The term matches neither a claimed `Skill` nor a recorded `Gap` — a
 * documented, honest "no information" outcome, never an empty `claimed` or
 * `not-claimed` shape.
 */
export interface UnknownSkillOutcome {
  kind: "unknown";
  term: string;
}

/** The discriminated union {@link getSkillEvidence} returns — exactly these three outcomes. */
export type SkillEvidenceOutcome = ClaimedSkillOutcome | NotClaimedGapOutcome | UnknownSkillOutcome;

function buildSkillAliasIndex(skills: Skill[]) {
  return buildAliasIndex(
    skills.map((skill) => ({ canonical: skill.id, aliases: [skill.name, ...skill.aliases] })),
  );
}

function buildGapAliasIndex(gaps: Gap[]) {
  return buildAliasIndex(
    gaps.map((gap) => ({ canonical: gap.id, aliases: [gap.name, ...gap.aliases] })),
  );
}

/**
 * Rebuilds each of `evidence`'s citations through {@link buildCitation}
 * (preserving each original citation's `fragment`, if any) so every returned
 * evidence citation is guaranteed to resolve against `repository`'s current
 * dataset, rather than trusting the possibly-stale label/shape stored on the
 * content record itself.
 */
function resolveEvidence(repository: CareerDataRepository, evidence: Citation[]): Citation[] {
  return evidence.map((citation) =>
    buildCitation(repository, citation.entityType, citation.entityId, {
      ...(citation.fragment === undefined ? {} : { fragment: citation.fragment }),
    }),
  );
}

function resolveRelatedSkills(
  repository: CareerDataRepository,
  relatedSkillIds: string[],
  skillsById: Map<string, Skill>,
): RelatedSkillEvidence[] {
  const resolved: RelatedSkillEvidence[] = [];
  for (const relatedId of relatedSkillIds) {
    const relatedSkill = skillsById.get(relatedId);
    if (relatedSkill === undefined) {
      continue;
    }
    resolved.push({
      skill: relatedSkill,
      evidence: resolveEvidence(repository, relatedSkill.evidence),
    });
  }
  return resolved;
}

/**
 * Resolves `skill` (a canonical name, or any alias/case/punctuation/diacritic
 * variant thereof — via the #55 alias-resolution module, no fuzzy or semantic
 * matching) against `repository`'s dataset of `Skill`s and `Gap`s, and
 * returns exactly one of three outcomes:
 *
 * - **`claimed`** — `skill` resolves to a claimed `Skill`. `citations` is the
 *   skill's own evidence, resolved fresh against the dataset.
 * - **`not-claimed`** — `skill` resolves to a recorded `Gap` instead. Never
 *   `claimed`, never empty. `citations` is a citation to the gap itself
 *   followed by every resolved related skill's evidence citations, in order.
 *   `gap.statement` is passed through byte-identical to the authored
 *   content — this service never synthesizes or rewords it.
 * - **`unknown`** — `skill` resolves to neither. `citations` is empty; this
 *   is the honest "no information" outcome, distinct from an empty result.
 *
 * Skills are checked before gaps (the content lint rule `no-claim-gap-collision`
 * guarantees they never share a resolvable term, so the order is
 * inconsequential in valid content, but skills take priority as the more
 * specific claim). Never throws for an unrecognized term.
 */
export function getSkillEvidence(
  repository: CareerDataRepository,
  skill: string,
): DomainResult<SkillEvidenceOutcome> {
  const { skills, gaps } = repository.getDataset();
  const skillsById = new Map(skills.map((entry) => [entry.id, entry]));
  const gapsById = new Map(gaps.map((entry) => [entry.id, entry]));

  const resolvedSkillId = buildSkillAliasIndex(skills).resolve(skill);
  if (resolvedSkillId !== undefined) {
    const skillRecord = skillsById.get(resolvedSkillId);
    if (skillRecord !== undefined) {
      const evidence = resolveEvidence(repository, skillRecord.evidence);
      const outcome: ClaimedSkillOutcome = { kind: "claimed", skill: skillRecord, evidence };
      return createDomainResult(outcome, evidence);
    }
  }

  const resolvedGapId = buildGapAliasIndex(gaps).resolve(skill);
  if (resolvedGapId !== undefined) {
    const gapRecord = gapsById.get(resolvedGapId);
    if (gapRecord !== undefined) {
      const gapCitation = buildCitation(repository, "gap", gapRecord.id);
      const relatedSkills = resolveRelatedSkills(repository, gapRecord.relatedSkills, skillsById);
      const outcome: NotClaimedGapOutcome = { kind: "not-claimed", gap: gapRecord, relatedSkills };
      const citations = [gapCitation, ...relatedSkills.flatMap((related) => related.evidence)];
      return createDomainResult(outcome, citations);
    }
  }

  const outcome: UnknownSkillOutcome = { kind: "unknown", term: skill };
  return createDomainResult(outcome, []);
}
