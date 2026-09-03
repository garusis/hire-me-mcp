/**
 * `listCareerStories(repository, filter?)` — the deterministic behavioral-
 * story service (#291, epic #288): every `CareerStory` matching a structured
 * filter, each returned complete and joined to compact parent-role context
 * so an interview question can be answered without a second lookup. No
 * fuzzy matching — topic, technology, vendor, situation and outcome wording
 * belongs to `searchCareer`. See README.md for the full documented
 * semantics.
 */

import type { CareerStory, ExperienceEntry } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import { compareExperience } from "./get-experience.js";
import type { CareerDataRepository } from "./repository.js";
import { type Citation, createDomainResult, type DomainResult } from "./result.js";

/**
 * Deterministic, structured-field filter for {@link listCareerStories}.
 *
 * **Combination semantics:** every field present must match (AND across
 * fields). Within `competencies`, a story matches if it carries *any* of
 * the given values as its primary or a supporting competency (OR within
 * the multi-value field). Omitted fields, and an empty `competencies`
 * array, impose no constraint. Every value is normalized by trimming and
 * lower-casing before an exact comparison — the same convention
 * `getExperience`'s `company` filter uses — and an unknown value simply
 * matches nothing.
 *
 * `retrievalTags` are deliberately not filterable here: they are semantic
 * discovery metadata for `searchCareer`, not a second deterministic
 * taxonomy (#305 decision 3).
 */
export interface CareerStoryFilter {
  /** Exact story id. */
  id?: string;
  /**
   * Exact experience id, matched against the story's primary `experienceId`
   * *or* any of its `relatedExperienceIds` (#305 decision 2).
   */
  experienceId?: string;
  /**
   * Exact company name of the primary or any related experience. When
   * combined with {@link experienceId}, both must describe the *same*
   * association — a story is never matched by taking the company from one
   * associated role and the id from another.
   */
  company?: string;
  /** Controlled competency values (see `COMPETENCIES`), OR'd; primary or supporting. */
  competencies?: string[];
}

/** Compact parent-role context: enough to frame a story, never the full entry or its highlights. */
export interface StoryExperienceContext {
  id: string;
  company: string;
  role: string;
  startDate: string;
  /** Omitted for a current role, exactly as on the underlying `ExperienceEntry`. */
  endDate?: string;
}

export interface CareerStoryListEntry {
  /** The complete authored record, `retrievalTags` included. */
  story: CareerStory;
  /** Where the event occurred. */
  primaryExperience: StoryExperienceContext;
  /** Discovery-only associations (#305 decision 2) — never the event's parent. */
  relatedExperiences: StoryExperienceContext[];
  /** The single citation for this story; the story is the only cited entity. */
  citation: Citation;
}

/** A story joined to its resolved associations — the unit the filter and sort operate on. */
interface ResolvedStory {
  story: CareerStory;
  primary: ExperienceEntry;
  related: ExperienceEntry[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toContext(entry: ExperienceEntry): StoryExperienceContext {
  return {
    id: entry.id,
    company: entry.company,
    role: entry.role,
    startDate: entry.startDate,
    ...(entry.endDate === undefined ? {} : { endDate: entry.endDate }),
  };
}

/**
 * Joins each story to its parent and related experiences. A story whose
 * primary experience does not resolve cannot satisfy the output contract
 * (no parent context, no position in parent-chronological order), so it is
 * excluded rather than thrown on — content lint normally blocks this
 * upstream, and a stale index must not take the whole listing down. A
 * related id that does not resolve is dropped from that story's context.
 */
function resolveStories(
  stories: readonly CareerStory[],
  experience: readonly ExperienceEntry[],
): ResolvedStory[] {
  const byId = new Map(experience.map((entry) => [entry.id, entry]));
  const resolved: ResolvedStory[] = [];
  for (const story of stories) {
    const primary = byId.get(story.experienceId);
    if (primary === undefined) {
      continue;
    }
    const related = (story.relatedExperienceIds ?? [])
      .map((id) => byId.get(id))
      .filter((entry): entry is ExperienceEntry => entry !== undefined);
    resolved.push({ story, primary, related });
  }
  return resolved;
}

/** Whether one association (primary or related) satisfies both the experienceId and company constraints. */
function matchesAssociation(
  { primary, related }: ResolvedStory,
  experienceId: string | undefined,
  company: string | undefined,
): boolean {
  if (experienceId === undefined && company === undefined) {
    return true;
  }
  return [primary, ...related].some(
    (entry) =>
      (experienceId === undefined || normalize(entry.id) === experienceId) &&
      (company === undefined || normalize(entry.company) === company),
  );
}

function matchesCompetencies(story: CareerStory, competencies: ReadonlySet<string>): boolean {
  if (competencies.size === 0) {
    return true;
  }
  return (
    competencies.has(story.primaryCompetency) ||
    story.supportingCompetencies.some((competency) => competencies.has(competency))
  );
}

interface NormalizedFilter {
  id: string | undefined;
  experienceId: string | undefined;
  company: string | undefined;
  competencies: ReadonlySet<string>;
}

function normalizeFilter(filter: CareerStoryFilter): NormalizedFilter {
  return {
    id: filter.id === undefined ? undefined : normalize(filter.id),
    experienceId: filter.experienceId === undefined ? undefined : normalize(filter.experienceId),
    company: filter.company === undefined ? undefined : normalize(filter.company),
    competencies: new Set((filter.competencies ?? []).map(normalize)),
  };
}

function matchesFilter(resolved: ResolvedStory, filter: NormalizedFilter): boolean {
  if (filter.id !== undefined && normalize(resolved.story.id) !== filter.id) {
    return false;
  }
  if (!matchesAssociation(resolved, filter.experienceId, filter.company)) {
    return false;
  }
  return matchesCompetencies(resolved.story, filter.competencies);
}

/**
 * Stable sort order, given the (possibly empty) set of filtered
 * competencies:
 *
 * 1. a story whose *primary* competency is in the filter sorts before one
 *    matched only through a supporting competency (no-op without a
 *    competency filter);
 * 2. parent experiences in reverse-chronological order — exactly
 *    `getExperience`'s {@link compareExperience} rule;
 * 3. story `id` ascending as the final tie breaker.
 */
function compareStories(
  a: ResolvedStory,
  b: ResolvedStory,
  competencies: ReadonlySet<string>,
): number {
  const aPrimary = competencies.has(a.story.primaryCompetency) ? 0 : 1;
  const bPrimary = competencies.has(b.story.primaryCompetency) ? 0 : 1;
  if (aPrimary !== bPrimary) {
    return aPrimary - bPrimary;
  }
  const byParent = compareExperience(a.primary, b.primary);
  if (byParent !== 0) {
    return byParent;
  }
  if (a.story.id === b.story.id) {
    return 0;
  }
  return a.story.id < b.story.id ? -1 : 1;
}

/**
 * Returns every {@link CareerStory} in `repository`'s dataset matching
 * `filter` (see {@link CareerStoryFilter} for combination semantics), sorted
 * per {@link compareStories}, each joined to compact primary and related
 * experience context and carrying its own story citation. `citations[i]`
 * is `data[i].citation`. A filter matching nothing returns an empty list
 * and an empty citation array — never throws.
 */
export function listCareerStories(
  repository: CareerDataRepository,
  filter: CareerStoryFilter = {},
): DomainResult<CareerStoryListEntry[]> {
  const { stories, experience } = repository.getDataset();
  const normalized = normalizeFilter(filter);
  const matched = resolveStories(stories, experience).filter((resolved) =>
    matchesFilter(resolved, normalized),
  );
  const sorted = [...matched].sort((a, b) => compareStories(a, b, normalized.competencies));
  const data = sorted.map(
    (resolved): CareerStoryListEntry => ({
      story: resolved.story,
      primaryExperience: toContext(resolved.primary),
      relatedExperiences: resolved.related.map(toContext),
      citation: buildCitation(repository, "story", resolved.story.id),
    }),
  );
  return createDomainResult(
    data,
    data.map((entry) => entry.citation),
  );
}
