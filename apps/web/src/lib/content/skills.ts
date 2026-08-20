/**
 * Typed accessors wrapping `packages/core`'s `getSkillEvidence(term)`, plus
 * a listing view over the full skills dataset.
 */

import "server-only";
import type { Skill } from "@hire-me-mcp/career-data";
import { type Citation, getSkillEvidence, type SkillEvidenceOutcome } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

// Re-exported so consumers outside the content layer (e.g. `app/page.tsx`)
// can type against `Skill` without importing `@hire-me-mcp/career-data`
// directly — see `content-source-guard.test.ts`.
export type { Skill };

/**
 * Proficiency ranking used to order the skills list — lower ranks first.
 * `Skill["proficiency"]` is the schema's own claimed flag (#28 exposes it
 * as an ordering here rather than hardcoding a "top skills" id list).
 */
const PROFICIENCY_RANK: Record<Skill["proficiency"], number> = {
  expert: 0,
  proficient: 1,
  familiar: 2,
};

export interface SkillsListView {
  items: Skill[];
}

/**
 * Every authored skill, ordered by proficiency (expert, then proficient,
 * then familiar) — a stable sort, so skills sharing a proficiency tier keep
 * their authored relative order. Does not mutate the repository's dataset.
 */
export function getSkillsListView(): SkillsListView {
  const skills = getCareerDataRepository().getDataset().skills;
  const items = [...skills].sort(
    (a, b) => PROFICIENCY_RANK[a.proficiency] - PROFICIENCY_RANK[b.proficiency],
  );
  return { items };
}

/**
 * View model for a single skill/gap lookup. `outcome` is
 * `packages/core`'s discriminated union (`claimed` / `not-claimed` /
 * `unknown`) passed through faithfully — no re-interpretation here. Pages
 * render gap honesty (an explicit `not-claimed` gap statement, distinct
 * from `unknown`) straight from `outcome.kind`.
 */
export interface SkillEvidenceView {
  outcome: SkillEvidenceOutcome;
  citations: Citation[];
}

/** Looks `term` up against claimed skills and recorded gaps, faithfully surfacing whichever it resolves to. */
export function getSkillEvidenceView(term: string): SkillEvidenceView {
  const result = getSkillEvidence(getCareerDataRepository(), term);
  return { outcome: result.data, citations: result.citations };
}
