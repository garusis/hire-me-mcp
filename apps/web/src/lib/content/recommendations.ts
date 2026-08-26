/**
 * Typed accessor for the recommendations listing (#190). Unlike
 * `projects.ts`/`writing.ts`, `packages/core` *does* have a dedicated
 * domain service for this data (`listRecommendations` — the same one the
 * MCP `list-recommendations` tool wraps), so this delegates to it rather
 * than re-deriving the sort order or citations here.
 *
 * Every function optionally takes a `CareerDataRepository`, defaulting to
 * the shared real-content one, so tests can inject an in-memory fixture
 * repository (the same seam `writing.ts` documents).
 */

import "server-only";
import type { Citation, Recommendation } from "@hire-me-mcp/career-data";
import { type CareerDataRepository, listRecommendations } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";
import { toSlug } from "./slug";

// Re-exported so consumers outside the content layer can type against
// `Recommendation` without importing `@hire-me-mcp/career-data` directly —
// see `content-source-guard.test.ts`.
export type { Recommendation };

/** One recommendation list entry, paired with its stable slug (for anchors) and citation. */
export interface RecommendationListItemView {
  slug: string;
  entry: Recommendation;
  citation: Citation;
}

export interface RecommendationsListView {
  items: RecommendationListItemView[];
  citations: Citation[];
}

/**
 * Every recommendation, most recent first (the domain service's own stable
 * order), each paired with its slug and a citation to itself.
 */
export function getRecommendationsListView(
  repository: CareerDataRepository = getCareerDataRepository(),
): RecommendationsListView {
  const { data, citations } = listRecommendations(repository);
  const items = data.map((entry, index) => ({
    slug: toSlug(entry.id),
    entry,
    // Same index order by construction: `listRecommendations` returns one
    // citation per entry, in entry order.
    citation: citations[index] as Citation,
  }));
  return { items, citations };
}
