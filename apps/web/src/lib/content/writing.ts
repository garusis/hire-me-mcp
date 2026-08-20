/**
 * Typed accessor for writing listing/detail views. Same rationale as
 * `projects.ts`: `packages/core` has no dedicated "list writing" service,
 * so this reads the dataset via the repository seam and reuses
 * `buildCitation`.
 *
 * Every function optionally takes a `CareerDataRepository`, defaulting to
 * the shared real-content one — real `writing` content is currently empty
 * (no articles authored yet), so tests inject an in-memory fixture
 * repository to exercise the non-empty path; every other accessor in this
 * directory has non-empty real content to test against directly and does
 * not need this seam.
 */

import "server-only";
import type { Citation, WritingEntry } from "@hire-me-mcp/career-data";
import { buildCitation, type CareerDataRepository } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";
import { findBySlug, listSlugs, type SlugLookup, toSlug } from "./slug";

/** One writing list entry, paired with its stable slug and citation. */
export interface WritingListItemView {
  slug: string;
  entry: WritingEntry;
  citation: Citation;
}

export interface WritingListView {
  items: WritingListItemView[];
  citations: Citation[];
}

/** A single writing entry plus its citation, or the documented not-found result. */
export type WritingEntryView = SlugLookup<{ entry: WritingEntry; citation: Citation }>;

function toListItem(repository: CareerDataRepository, entry: WritingEntry): WritingListItemView {
  return {
    slug: toSlug(entry.id),
    entry,
    citation: buildCitation(repository, "writing", entry.id),
  };
}

/** Every writing entry, each paired with its slug and a citation to itself. */
export function getWritingListView(
  repository: CareerDataRepository = getCareerDataRepository(),
): WritingListView {
  const items = repository.getDataset().writing.map((entry) => toListItem(repository, entry));
  return { items, citations: items.map((item) => item.citation) };
}

/** Every writing slug, for `generateStaticParams`. */
export function listWritingSlugs(
  repository: CareerDataRepository = getCareerDataRepository(),
): string[] {
  return listSlugs(repository.getDataset().writing, (entry) => entry.id);
}

/**
 * A single writing entry by slug. Returns the documented not-found result
 * (`{ found: false, slug }`) for an unrecognized slug rather than throwing.
 */
export function getWritingEntryView(
  slug: string,
  repository: CareerDataRepository = getCareerDataRepository(),
): WritingEntryView {
  const lookup = findBySlug(repository.getDataset().writing, slug, (entry) => entry.id);
  if (!lookup.found) {
    return lookup;
  }
  const citation = buildCitation(repository, "writing", lookup.value.id);
  return { found: true, slug, value: { entry: lookup.value, citation } };
}
