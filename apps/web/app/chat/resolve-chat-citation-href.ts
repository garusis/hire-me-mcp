/**
 * Adapter from the chat agent's inline `[cite:...]` marker shape
 * (`CitationMarker`, `@hire-me-mcp/agent`) to a site-section href, for the
 * chat UI (#70).
 *
 * Reuses `../skills/citation-href.ts`'s `resolveCitationHref` (#30) rather
 * than re-deriving the entityType -> route mapping: that function already
 * encodes the one true mapping from a `Citation`-shaped
 * `entityType`/`entityId` to `/experience#<slug>`, `/projects/<slug>`,
 * `/skills#<slug>`, `/skills#gap-<slug>`, or a writing entry's URL. It
 * requires a `Citation`'s `label` field, which this marker shape doesn't
 * carry and `resolveCitationHref` never reads — a placeholder is passed
 * through purely to satisfy the type.
 *
 * `resolveCitationHref` itself falls back to `/` for entity types it
 * doesn't recognize (`profile`, `education` — never emitted as chat
 * citations by the agent's tool set today, see `packages/agent`'s
 * `CitableEntityType`). A silent link to the home page would read as a
 * broken citation in the chat UI, so this function narrows to the site
 * sections the chat surface can actually link to and returns `undefined`
 * for anything else — the caller (`citation-text.tsx`) renders that as
 * plain, unlinked text instead.
 */

import type { CitationMarker } from "@hire-me-mcp/agent";
import type { Citation } from "@hire-me-mcp/core";
import type { WritingEntry } from "../../src/lib/content";
import { resolveCitationHref } from "../skills/citation-href";

const RESOLVABLE_ENTITY_TYPES: ReadonlySet<CitationMarker["entityType"]> = new Set([
  "experience",
  "project",
  "skill",
  "gap",
  "writing",
]);

/**
 * Resolves a parsed chat citation marker to a site-section href, or
 * `undefined` if it doesn't point at a section the site can link to.
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
