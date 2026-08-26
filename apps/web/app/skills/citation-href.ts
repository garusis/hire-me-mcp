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
 * - `profile` → the home page's `#profile` section (`app/page.tsx`), which
 *   renders the profile record's own summary.
 * - `education` → the matching credential card in `/experience#education`
 *   (issue 231 added both the section and the per-entry anchors).
 * - `recommendation` → the matching card on `/recommendations` (issue 190).
 * - Anything else — a `CitableEntityType` added later with no site surface
 *   yet — falls back to the home page rather than producing a broken link.
 *
 * The last three cases were added for issue 227: `getProfile`,
 * `listEducation` and `listRecommendations` in `packages/core` have always
 * emitted `profile`/`education`/`recommendation` citations, so treating
 * them as "never emitted" made the chat surface drop the citation on most
 * answers. `citation-href.test.ts` now asserts every `CitableEntityType`
 * resolves to something other than the bare home-page fallback, so this
 * can't silently drift again.
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

/**
 * The home page's profile-section anchor — a `profile` citation's target
 * (issue 227). Exported so `app/page.tsx` renders the id from this same
 * constant and `page.test.tsx` can assert the anchor a citation points at
 * really exists, rather than two files agreeing on a string by luck.
 */
export const PROFILE_SECTION_ID = "profile";

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
    case "profile":
      return `/#${PROFILE_SECTION_ID}`;
    case "education":
      return `/experience#${toSlug(citation.entityId)}`;
    case "recommendation":
      return `/recommendations#${toSlug(citation.entityId)}`;
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
