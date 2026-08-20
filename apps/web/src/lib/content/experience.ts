/** Typed accessor wrapping `packages/core`'s `getExperience(filter?)`. */

import "server-only";
import type { Citation, ExperienceEntry } from "@hire-me-mcp/career-data";
import { type ExperienceFilter, getExperience } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";
import { findBySlug, listSlugs, type SlugLookup, toSlug } from "./slug";

/** One experience list entry, paired with its stable slug and citation. */
export interface ExperienceListItemView {
  slug: string;
  entry: ExperienceEntry;
  citation: Citation;
}

export interface ExperienceListView {
  items: ExperienceListItemView[];
  citations: Citation[];
}

/** A single experience entry plus its citation, or the documented not-found result. */
export type ExperienceEntryView = SlugLookup<{ entry: ExperienceEntry; citation: Citation }>;

function toIndexedCitation(
  citations: readonly Citation[],
  index: number,
  entryId: string,
): Citation {
  const citation = citations[index];
  if (citation === undefined) {
    throw new Error(`content layer: experience entry "${entryId}" has no matching citation`);
  }
  return citation;
}

/**
 * List view over `packages/core`'s `getExperience(filter?)` — same
 * deterministic, reverse-chronological order, each entry paired with its
 * slug and the citation `packages/core` built for it.
 */
export function getExperienceListView(filter?: ExperienceFilter): ExperienceListView {
  const result = getExperience(getCareerDataRepository(), filter);
  const items = result.data.map((entry, index) => ({
    slug: toSlug(entry.id),
    entry,
    citation: toIndexedCitation(result.citations, index, entry.id),
  }));
  return { items, citations: result.citations };
}

/** Every experience slug, for `generateStaticParams`. */
export function listExperienceSlugs(): string[] {
  return listSlugs(getExperience(getCareerDataRepository()).data, (entry) => entry.id);
}

/**
 * A single experience entry by slug. Returns the documented not-found
 * result (`{ found: false, slug }`) for an unrecognized slug rather than
 * throwing.
 */
export function getExperienceEntryView(slug: string): ExperienceEntryView {
  const result = getExperience(getCareerDataRepository());
  const lookup = findBySlug(result.data, slug, (entry) => entry.id);
  if (!lookup.found) {
    return lookup;
  }
  const index = result.data.indexOf(lookup.value);
  const citation = toIndexedCitation(result.citations, index, lookup.value.id);
  return { found: true, slug, value: { entry: lookup.value, citation } };
}
