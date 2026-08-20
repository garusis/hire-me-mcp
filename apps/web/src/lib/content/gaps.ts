/**
 * Typed accessor for the "what I don't claim" gap listing. `packages/core`
 * has no dedicated "list gaps" service — `getSkillEvidence` only resolves a
 * single term at a time — so this reads the dataset via the repository seam
 * directly, the same way `projects.ts`/`writing.ts` do, and reuses
 * `buildCitation` for a citation to each gap itself.
 *
 * This is the honesty surface the project is built around (epic #2): a Gap
 * is first-class data, not the absence of a Skill record, so `/skills` can
 * render "no, he has not worked with X" straight from the dataset.
 */

import "server-only";
import type { Citation, Gap, Skill } from "@hire-me-mcp/career-data";
import { buildCitation, type CareerDataRepository } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

/** One recorded gap, paired with a citation to itself and its resolved related skills. */
export interface GapListItemView {
  gap: Gap;
  citation: Citation;
  relatedSkills: Skill[];
}

export interface GapsListView {
  items: GapListItemView[];
}

function resolveRelatedSkills(
  relatedSkillIds: readonly string[],
  skillsById: Map<string, Skill>,
): Skill[] {
  const resolved: Skill[] = [];
  for (const id of relatedSkillIds) {
    const skill = skillsById.get(id);
    if (skill !== undefined) {
      resolved.push(skill);
    }
  }
  return resolved;
}

function toListItem(
  repository: CareerDataRepository,
  gap: Gap,
  skillsById: Map<string, Skill>,
): GapListItemView {
  return {
    gap,
    citation: buildCitation(repository, "gap", gap.id),
    relatedSkills: resolveRelatedSkills(gap.relatedSkills, skillsById),
  };
}

/**
 * Every recorded gap, authored order, each paired with a citation to itself
 * and its adjacent claimed skills resolved to their real `Skill` records
 * (unresolvable ids are silently dropped rather than throwing — the same
 * tolerance `getSkillEvidence`'s related-skill resolution applies).
 */
export function getGapsListView(
  repository: CareerDataRepository = getCareerDataRepository(),
): GapsListView {
  const dataset = repository.getDataset();
  const skillsById = new Map(dataset.skills.map((skill) => [skill.id, skill]));
  const items = dataset.gaps.map((gap) => toListItem(repository, gap, skillsById));
  return { items };
}
