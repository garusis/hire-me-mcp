/** Typed accessor wrapping `packages/core`'s `getSkillEvidence(term)`. */

import "server-only";
import { type Citation, getSkillEvidence, type SkillEvidenceOutcome } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

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
