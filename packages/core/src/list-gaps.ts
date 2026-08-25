/**
 * `listGaps(repository)` — the authoritative known-gaps enumeration (#213):
 * every `Gap` record, `statement` passed through byte-identical to the
 * authored content, with each gap's `relatedSkills` ids resolved to real
 * skill citations. See README.md for the full documented semantics.
 */

import type { Citation, Gap } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * One enumerated gap: the authored `Gap` fields with `relatedSkills`
 * resolved from bare skill ids into full {@link Citation}s pointing at the
 * claimed skills adjacent to this gap.
 */
export interface GapListEntry {
  id: Gap["id"];
  name: Gap["name"];
  aliases: Gap["aliases"];
  /** The authored statement, byte-identical — never synthesized or reworded. */
  statement: Gap["statement"];
  /** The gap's adjacent claimed skills, resolved to citations (unresolvable ids are skipped). */
  relatedSkills: Citation[];
}

/** Stable sort order: `id` ascending — fully deterministic regardless of input array order. */
function compareGaps(a: Gap, b: Gap): number {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function resolveRelatedSkills(
  repository: CareerDataRepository,
  relatedSkillIds: string[],
): Citation[] {
  const { skills } = repository.getDataset();
  const knownIds = new Set(skills.map((skill) => skill.id));
  return relatedSkillIds
    .filter((relatedId) => knownIds.has(relatedId))
    .map((relatedId) => buildCitation(repository, "skill", relatedId));
}

/**
 * Returns every gap in `repository`'s dataset as a {@link GapListEntry},
 * sorted per {@link compareGaps}. Each entry's `statement` is the authored
 * content's own string, unmodified; `relatedSkills` resolves the gap's
 * adjacent-skill ids to skill citations, silently skipping any id that does
 * not resolve (the same tolerance `getSkillEvidence` applies).
 * `citations[i]` is a citation to `data[i]`'s gap entity itself (label =
 * gap name). An empty dataset returns an empty list and an empty citation
 * array — never throws.
 */
export function listGaps(repository: CareerDataRepository): DomainResult<GapListEntry[]> {
  const { gaps } = repository.getDataset();
  const sorted = [...gaps].sort(compareGaps);
  const entries: GapListEntry[] = sorted.map((gap) => ({
    id: gap.id,
    name: gap.name,
    aliases: gap.aliases,
    statement: gap.statement,
    relatedSkills: resolveRelatedSkills(repository, gap.relatedSkills),
  }));
  const citations = sorted.map((gap) => buildCitation(repository, "gap", gap.id));
  return createDomainResult(entries, citations);
}
