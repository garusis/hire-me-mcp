/**
 * `listSkills(repository, filter?)` — the full claimed-skills inventory
 * (#212): every `Skill` record matching an optional structured filter, in
 * the documented stable order, with each record's evidence citations
 * resolved fresh against the dataset (the same way `getSkillEvidence`'s
 * `claimed` branch resolves them). See README.md for the full documented
 * semantics.
 */

import type { Citation, Skill } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * Deterministic, structured-field filter for {@link listSkills}.
 *
 * **Combination semantics:** every field present must match (AND across
 * fields). Omitted fields impose no constraint. No fuzzy or semantic
 * matching — each field is exact-matched against structured data.
 */
export interface SkillsFilter {
  /** Exact match against `category`, case-insensitive (still exact — no fuzzy matching). */
  category?: string;
  /** Exact match against the `proficiency` enum value. */
  proficiency?: Skill["proficiency"];
}

/**
 * Stable sort order: `name` ascending, compared case-insensitively (plain
 * code-point comparison — no locale dependence), ties broken by `id`
 * ascending, so the order is fully deterministic regardless of input array
 * order.
 */
function compareSkills(a: Skill, b: Skill): number {
  const aName = a.name.toLowerCase();
  const bName = b.name.toLowerCase();
  if (aName !== bName) {
    return aName < bName ? -1 : 1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function matchesFilter(skill: Skill, filter: SkillsFilter): boolean {
  if (
    filter.category !== undefined &&
    skill.category.toLowerCase() !== filter.category.trim().toLowerCase()
  ) {
    return false;
  }
  return filter.proficiency === undefined || skill.proficiency === filter.proficiency;
}

/**
 * Rebuilds each of `evidence`'s citations through {@link buildCitation}
 * (preserving each original citation's `fragment`, if any) so every
 * returned evidence citation is guaranteed to resolve against
 * `repository`'s current dataset — the same guarantee `getSkillEvidence`'s
 * `claimed` branch makes.
 */
function resolveEvidence(repository: CareerDataRepository, evidence: Citation[]): Citation[] {
  return evidence.map((citation) =>
    buildCitation(repository, citation.entityType, citation.entityId, {
      ...(citation.fragment === undefined ? {} : { fragment: citation.fragment }),
    }),
  );
}

/**
 * Returns every {@link Skill} in `repository`'s dataset matching `filter`
 * (see {@link SkillsFilter} for combination semantics), sorted per
 * {@link compareSkills}. Each returned record's `evidence` array is resolved
 * fresh against the dataset; `citations[i]` is a citation to `data[i]`'s
 * skill entity itself (label = skill name). A filter matching nothing
 * returns an empty list and an empty citation array — never throws.
 */
export function listSkills(
  repository: CareerDataRepository,
  filter: SkillsFilter = {},
): DomainResult<Skill[]> {
  const { skills } = repository.getDataset();
  const matched = skills.filter((skill) => matchesFilter(skill, filter));
  const sorted = [...matched].sort(compareSkills);
  const resolved = sorted.map((skill) => ({
    ...skill,
    evidence: resolveEvidence(repository, skill.evidence),
  }));
  const citations = resolved.map((skill) => buildCitation(repository, "skill", skill.id));
  return createDomainResult(resolved, citations);
}
