/**
 * Adapter from the chat agent's inline `[cite:...]` marker shape
 * (`CitationMarker`, `@hire-me-mcp/agent`) to a site-section href, for the
 * chat UI (#70).
 *
 * Reuses `../skills/citation-href.ts`'s `resolveCitationHref` (#30) rather
 * than re-deriving the entityType -> route mapping: that function already
 * encodes the one true mapping from a `Citation`-shaped
 * `entityType`/`entityId` to `/experience#<slug>`, `/projects/<slug>`,
 * `/skills#<slug>`, `/skills#gap-<slug>`, `/#profile`,
 * `/recommendations#<slug>`, or a writing entry's URL. It requires a
 * `Citation`'s `label` field, which this marker shape doesn't carry and
 * `resolveCitationHref` never reads — a placeholder is passed through
 * purely to satisfy the type.
 *
 * ## Issue 227: no more silent drops
 *
 * This module used to narrow to five entity types and return `undefined`
 * for `profile`/`education`/`recommendation` on the belief that the
 * agent's tool set never emitted them. It does: `get-profile`,
 * `list-recommendations` and `search-career` (over `education` chunks) all
 * emit exactly those. The chat therefore dropped the marker — and, worse,
 * dropped it from the rendered sentence — on most answers, producing the
 * "no citations at all, plus a stray ` .`" defect issue 227 reported on a
 * site whose pitch is cited, grounded answers.
 *
 * Every member of `CitableEntityType` now maps to a real site surface, and
 * `resolve-chat-citation-href.test.ts` iterates the shared
 * `CITABLE_ENTITY_TYPES` list to prove it — so a type added to the agent's
 * citation format later fails a test here instead of silently vanishing
 * from answers. `undefined` is kept as the return for that
 * not-yet-mapped case only.
 */

import { CITABLE_ENTITY_TYPES, type CitationMarker } from "@hire-me-mcp/agent/citations";
import type { Citation } from "@hire-me-mcp/core";
import type { WritingEntry } from "../../src/lib/content";
import { resolveCitationHref } from "../skills/citation-href";

const RESOLVABLE_ENTITY_TYPES: ReadonlySet<CitationMarker["entityType"]> = new Set(
  CITABLE_ENTITY_TYPES,
);

/**
 * Resolves a parsed chat citation marker to a site-section href, or
 * `undefined` if its entity type has no site surface at all (only reachable
 * if the agent's marker format grows a type this app hasn't mapped yet).
 */
export function resolveChatCitationHref(
  marker: CitationMarker,
  writingEntries: readonly WritingEntry[],
): string | undefined {
  if (!RESOLVABLE_ENTITY_TYPES.has(marker.entityType)) {
    return undefined;
  }
  const citation: Citation = {
    entityType: marker.entityType,
    entityId: marker.entityId,
    fragment: marker.fragment,
    // Unused by `resolveCitationHref` — required only to satisfy `Citation`'s shape.
    label: marker.entityId,
  };
  return resolveCitationHref(citation, writingEntries);
}
