/**
 * `listRecommendations()` — every LinkedIn recommendation Marcos has
 * received (#190), verbatim, most recent first, each carrying a citation
 * resolving to it. Read-only: display + link-out data only, no contact
 * functionality.
 */

import type { Recommendation } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * Stable sort order: reverse-chronological by `date` (most recent first).
 * Ties are broken by `id` ascending, so the order is fully deterministic
 * regardless of input array order.
 */
function compareRecommendations(a: Recommendation, b: Recommendation): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Returns every {@link Recommendation} in `repository`'s dataset, sorted
 * per {@link compareRecommendations}, each with a citation resolving to
 * it. A dataset with no recommendations authored returns an empty list and
 * an empty citation array — never throws.
 */
export function listRecommendations(
  repository: CareerDataRepository,
): DomainResult<Recommendation[]> {
  const { recommendations } = repository.getDataset();
  const sorted = [...recommendations].sort(compareRecommendations);
  const citations = sorted.map((entry) => buildCitation(repository, "recommendation", entry.id));
  return createDomainResult(sorted, citations);
}
