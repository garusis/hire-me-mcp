/**
 * Canonical site URLs for MCP citations (#247). The home page promises
 * "citations back to the source", but a citation's `entityType`/`entityId`
 * pair is only resolvable by someone who already knows this site's route
 * layout — an MCP client can't invent `/experience#<id>` on its own. This
 * module turns every citation into a clickable, absolute URL:
 *
 * - a citation that already carries its own `url` (a `ChunkCitation`
 *   pointing at an external canonical source, e.g. a project's GitHub
 *   repo) keeps it untouched;
 * - everything else gets the same in-site route the website itself links
 *   citations to (`app/skills/citation-href.ts` — one mapping, shared, so
 *   the MCP surface can never drift from the site's own citation links),
 *   made absolute against `getSiteUrl()`.
 *
 * Used by `envelope.ts` (every tool's top-level `citations` array) and by
 * `tools/search-career.ts` (per-hit `citationUrl`).
 */

import type { Citation } from "@hire-me-mcp/core";
import { resolveCitationHref } from "../../app/skills/citation-href";
import { getSiteUrl } from "../../src/lib/config/site-url";
import { getWritingListView } from "../../src/lib/content";

/** A citation that may already carry its own canonical external URL (`ChunkCitation` does). */
export type CitationWithOptionalUrl = Citation & { url?: string };

/** A citation guaranteed to carry a resolvable URL — what every MCP response ships (#247). */
export type CitedWithUrl = Citation & { url: string };

/**
 * Writing entries for `resolveCitationHref`'s writing-url lookup —
 * best-effort: URL resolution is a presentation concern, so a content
 * layer that can't serve the writing list (a test harness with a mocked
 * repository, an empty dataset) degrades to the `/writing` page link
 * rather than failing the whole tool call.
 */
function writingEntriesSafe(): Parameters<typeof resolveCitationHref>[1] {
  try {
    return getWritingListView().items.map((item) => item.entry);
  } catch {
    return [];
  }
}

/**
 * The absolute URL a human should follow to verify `citation`: its own
 * external `url` when it has one, otherwise the citation's canonical page
 * on this site.
 */
export function resolveCitationSiteUrl(citation: CitationWithOptionalUrl): string {
  if (citation.url !== undefined) {
    return citation.url;
  }
  const writingEntries = citation.entityType === "writing" ? writingEntriesSafe() : [];
  const href = resolveCitationHref(citation, writingEntries);
  return href.startsWith("http") ? href : `${getSiteUrl()}${href}`;
}

/** Copies `citations`, adding a resolved `url` to each entry that lacks one. Never mutates input. */
export function withCitationSiteUrls(
  citations: readonly CitationWithOptionalUrl[],
): CitedWithUrl[] {
  return citations.map((citation) => ({ ...citation, url: resolveCitationSiteUrl(citation) }));
}
