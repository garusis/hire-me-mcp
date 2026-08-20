/**
 * Citation-to-route mapping for `/skills`: every evidence citation
 * `packages/core` returns points at a real career-data entity by
 * `entityType`/`entityId` — this resolves that pointer to the in-site route
 * (or, for writing entries first published elsewhere, the external URL) it
 * should link to.
 *
 * - `experience` → the matching anchor on `/experience` (added in this PR;
 *   see `apps/web/app/experience/page.tsx`).
 * - `project` → the `/projects/[slug]` detail route (#29).
 * - `skill` → the matching anchor on `/skills` itself (used by the gap
 *   section's "closest related experience" links).
 * - `gap` → the matching anchor in the `/skills` "what I don't claim"
 *   section.
 * - `writing` → the entry's canonical external URL if it has one, otherwise
 *   its anchor on `/writing` (there is no local writing detail route today
 *   — real `writing` content is empty; see `/writing`'s doc comment).
 * - Anything else (`profile`, `education` — never emitted as skill evidence
 *   by `packages/core` today) falls back to the home page rather than
 *   producing a broken link.
 */

import type { Citation } from "@hire-me-mcp/core";
import { toSlug, type WritingEntry } from "../../src/lib/content";

export function resolveCitationHref(
  citation: Citation,
  writingEntries: readonly WritingEntry[],
): string {
  switch (citation.entityType) {
    case "experience":
      return `/experience#${toSlug(citation.entityId)}`;
    case "project":
      return `/projects/${toSlug(citation.entityId)}`;
    case "skill":
      return `/skills#${toSlug(citation.entityId)}`;
    case "gap":
      return `/skills#gap-${toSlug(citation.entityId)}`;
    case "writing":
      return resolveWritingHref(citation.entityId, writingEntries);
    default:
      return "/";
  }
}

function resolveWritingHref(entityId: string, writingEntries: readonly WritingEntry[]): string {
  const entry = writingEntries.find((candidate) => candidate.id === entityId);
  if (entry === undefined) {
    return "/writing";
  }
  return entry.url ?? `/writing#${toSlug(entry.id)}`;
}
