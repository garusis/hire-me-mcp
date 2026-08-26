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
 * - `recommendation` → the matching card anchor on `/recommendations`
 *   (issue 190); that card carries the entry's own two LinkedIn links,
 *   which is the closest thing to a permalink LinkedIn offers. Spelled
 *   "issue 190" rather than with a leading hash, per the convention the
 *   rest of `app/` follows: the design-system hex-colour scanner
 *   (`design-system/lib/no-hardcoded-hex.test.ts`) reads a 3-digit issue
 *   reference as a raw colour literal.
 * - `writing` → the entry's canonical external URL if it has one, otherwise
 *   its anchor on `/writing` (there is no local writing detail route today
 *   — real `writing` content is empty; see `/writing`'s doc comment).
 * - Anything else (`profile`, `education` — never emitted as skill evidence
 *   by `packages/core` today) falls back to the home page rather than
 *   producing a broken link.
 */

import type { Citation } from "@hire-me-mcp/core";
import type { WritingEntry } from "../../src/lib/content";
// `toSlug` comes from its own leaf module, not the `../../src/lib/content`
// barrel: that barrel's `index.ts` (and `writing.ts`, which re-exports
// `WritingEntry`) starts with `import "server-only"`, so a *value* import
// of anything from it — unlike the `import type` above, which is erased at
// compile time — pulls that whole module graph into any bundle that
// reaches this file. This module is reused client-side by the chat
// surface's `resolve-chat-citation-href.ts` (#70), which fails to build if
// this file value-imports from the barrel. See
// `citation-href.test.ts`'s "has no runtime dependency on..." case.
import { toSlug } from "../../src/lib/content/slug";

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
    case "recommendation":
      return `/recommendations#${toSlug(citation.entityId)}`;
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
