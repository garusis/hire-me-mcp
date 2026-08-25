/**
 * `listEducation(repository)` — deterministic enumeration of every
 * education record (#211): the full `EducationEntry[]` in the documented
 * stable order, each carrying a citation resolving to it. See README.md
 * for the full documented semantics.
 */

import type { EducationEntry } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/** Sentinel bounds so optional dates compare correctly against `YYYY-MM` strings. */
const MIN_DATE = "0000-01";
const MAX_DATE = "9999-12";

/**
 * Stable sort order: most recent first by `endDate`, treating a missing
 * `endDate` (an in-progress credential) as open-ended — it sorts first.
 * Ties are broken by `startDate` descending (a missing `startDate` sorts
 * last among same-end ties), then by `id` ascending, so the order is fully
 * deterministic regardless of input array order.
 */
function compareEducation(a: EducationEntry, b: EducationEntry): number {
  const aEnd = a.endDate ?? MAX_DATE;
  const bEnd = b.endDate ?? MAX_DATE;
  if (aEnd !== bEnd) {
    return aEnd < bEnd ? 1 : -1;
  }
  const aStart = a.startDate ?? MIN_DATE;
  const bStart = b.startDate ?? MIN_DATE;
  if (aStart !== bStart) {
    return aStart < bStart ? 1 : -1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Returns every {@link EducationEntry} in `repository`'s dataset, sorted per
 * {@link compareEducation}, each with a citation resolving to it
 * (`citations[i]` corresponds to `data[i]`; the label is the citation
 * builder's derived `"{credential}, {institution}"`). Optional dates are
 * preserved exactly as authored — a missing `endDate` honestly means the
 * credential is still in progress, never invented. An empty dataset returns
 * an empty list and an empty citation array — never throws.
 */
export function listEducation(repository: CareerDataRepository): DomainResult<EducationEntry[]> {
  const { education } = repository.getDataset();
  const sorted = [...education].sort(compareEducation);
  const citations = sorted.map((entry) => buildCitation(repository, "education", entry.id));
  return createDomainResult(sorted, citations);
}
