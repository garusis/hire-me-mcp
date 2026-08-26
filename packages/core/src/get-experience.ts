/**
 * `getExperience(filter?)` — the second domain service: every experience
 * entry matching a deterministic, structured-field filter, in the documented
 * stable order, each carrying a citation resolving to it. See README.md for
 * the full documented semantics.
 */

import type { ExperienceEntry } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * Deterministic, structured-field filter for {@link getExperience}.
 *
 * **Combination semantics:** every field present on the filter must match
 * (AND across fields). Within `tech`, an entry matches if it has *any* of
 * the given tags (OR within the multi-value field). Omitted fields impose no
 * constraint. No fuzzy or semantic matching — every field is exact-matched
 * against structured data.
 */
export interface ExperienceFilter {
  /** Exact match against `company`, case-insensitive (still exact — no fuzzy matching). */
  company?: string;
  /**
   * Technology tags to match against an entry's `tech` array (the controlled
   * vocabulary from `@hire-me-mcp/career-data`'s `TECH_TAGS`). An entry
   * matches if it has at least one of the given tags — OR within this field.
   * Matching is exact but case-insensitive (`"TypeScript"` matches the
   * canonical `"typescript"` tag), the same convention as {@link company}
   * and `searchProjects`' `tags` option (#226). An empty array imposes no
   * constraint, same as omitting the field.
   */
  tech?: string[];
  /**
   * Inclusive lower bound (`YYYY-MM`) of a date-range overlap check against
   * an entry's `[startDate, endDate]` span. A role with no `endDate` (a
   * current role) is treated as open-ended — still ongoing — so it overlaps
   * any range that reaches into the present.
   */
  from?: string;
  /** Inclusive upper bound (`YYYY-MM`) of the same date-range overlap check as {@link from}. */
  to?: string;
  /**
   * `"current"` restricts to the entry (entries) with no `endDate`;
   * `"past"` restricts to entries that have one. Omitted imposes no
   * constraint.
   */
  status?: "current" | "past";
}

/** Sentinel bounds so an open range compares correctly against `YYYY-MM` strings. */
const MIN_DATE = "0000-01";
const MAX_DATE = "9999-12";

function matchesCompany(entry: ExperienceEntry, company: string): boolean {
  return entry.company.trim().toLowerCase() === company.trim().toLowerCase();
}

function matchesTech(entry: ExperienceEntry, tags: string[]): boolean {
  // Case-insensitive, like `matchesCompany` and `searchProjects`' tag
  // resolution — an LLM caller naturally writes "TypeScript", and a
  // case-sensitive miss here silently reads as "no such experience" (#226).
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase());
  const entryTech = new Set(entry.tech.map((tag) => tag.toLowerCase()));
  return normalizedTags.some((tag) => entryTech.has(tag));
}

function matchesDateRange(entry: ExperienceEntry, from?: string, to?: string): boolean {
  const entryEnd = entry.endDate ?? MAX_DATE;
  const filterFrom = from ?? MIN_DATE;
  const filterTo = to ?? MAX_DATE;
  return entry.startDate <= filterTo && entryEnd >= filterFrom;
}

function matchesStatus(entry: ExperienceEntry, status?: "current" | "past"): boolean {
  if (status === undefined) {
    return true;
  }
  const isCurrent = entry.endDate === undefined;
  return status === "current" ? isCurrent : !isCurrent;
}

function matchesFilter(entry: ExperienceEntry, filter: ExperienceFilter): boolean {
  if (filter.company !== undefined && !matchesCompany(entry, filter.company)) {
    return false;
  }
  if (filter.tech !== undefined && filter.tech.length > 0 && !matchesTech(entry, filter.tech)) {
    return false;
  }
  if (!matchesDateRange(entry, filter.from, filter.to)) {
    return false;
  }
  return matchesStatus(entry, filter.status);
}

/**
 * Stable sort order: reverse-chronological by `startDate` (most recent
 * first). Ties (identical `startDate`) are broken by `endDate` descending,
 * treating an open-ended (current) role as sorting first among same-start
 * ties. Any remaining tie is broken by `id` ascending, so the order is fully
 * deterministic regardless of input array order.
 */
function compareExperience(a: ExperienceEntry, b: ExperienceEntry): number {
  if (a.startDate !== b.startDate) {
    return a.startDate < b.startDate ? 1 : -1;
  }
  const aEnd = a.endDate ?? MAX_DATE;
  const bEnd = b.endDate ?? MAX_DATE;
  if (aEnd !== bEnd) {
    return aEnd < bEnd ? 1 : -1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Returns every {@link ExperienceEntry} in `repository`'s dataset matching
 * `filter` (see {@link ExperienceFilter} for combination semantics), sorted
 * per {@link compareExperience}, each with a citation resolving to it. A
 * filter matching nothing returns an empty list and an empty citation array
 * — never throws.
 */
export function getExperience(
  repository: CareerDataRepository,
  filter: ExperienceFilter = {},
): DomainResult<ExperienceEntry[]> {
  const { experience } = repository.getDataset();
  const matched = experience.filter((entry) => matchesFilter(entry, filter));
  const sorted = [...matched].sort(compareExperience);
  const citations = sorted.map((entry) => buildCitation(repository, "experience", entry.id));
  return createDomainResult(sorted, citations);
}
