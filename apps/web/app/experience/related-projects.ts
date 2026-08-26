import type { ProjectListItemView } from "../../src/lib/content";

/**
 * A single shared tag (e.g. "typescript" or "nodejs") is too generic a
 * signal on this data set — most experience entries and most projects carry
 * at least one of a handful of common language/platform tags, which would
 * make nearly everything "related" to everything else. Two or more shared
 * tags is a meaningfully stronger, still purely data-driven, signal.
 */
const MIN_SHARED_TECH = 2;

/** The `YYYY-MM` span of the experience entry being matched. */
export interface EntryPeriod {
  startDate: string;
  /** Omitted means the role is current (open-ended). */
  endDate?: string | undefined;
}

/** Sentinel bound so open-ended spans compare correctly as `YYYY-MM` strings. */
const MAX_DATE = "9999-12";

/**
 * Whether the project's declared work period overlaps the role's span. A
 * project with no `period` imposes no time constraint (tag overlap alone
 * decides) — but a project that declares one is only related to roles it
 * actually coexisted with. This is the issue-224 fix: the flagship hire-me-mcp
 * record shares 2+ generic tags with nearly every role back to 2013, and
 * only its `period` (2026–present) makes "related" time-sensible.
 */
function overlapsEntryPeriod(
  projectPeriod: { start: string; end?: string | undefined } | undefined,
  entry: EntryPeriod,
): boolean {
  if (projectPeriod === undefined) {
    return true;
  }
  const projectEnd = projectPeriod.end ?? MAX_DATE;
  const entryEnd = entry.endDate ?? MAX_DATE;
  return projectPeriod.start <= entryEnd && projectEnd >= entry.startDate;
}

/**
 * Projects that share at least {@link MIN_SHARED_TECH} `tech` values with an
 * experience entry AND (when the project declares a `period`) overlap the
 * entry's own date span — the data-driven cross-link between `/experience`
 * and `/projects/[slug]`. Neither `ExperienceEntry` nor `Project` carries an
 * explicit relation field, so the relation the content expresses is tech
 * overlap constrained by time, computed here rather than hardcoded per
 * entry. Preserves `projects`' own order.
 */
export function getRelatedProjects(
  entry: EntryPeriod & { tech: readonly string[] },
  projects: readonly ProjectListItemView[],
): ProjectListItemView[] {
  const entryTechSet = new Set(entry.tech);
  return projects.filter((item) => {
    if (!overlapsEntryPeriod(item.project.period, entry)) {
      return false;
    }
    const sharedCount = item.project.tech.filter((tag) => entryTechSet.has(tag)).length;
    return sharedCount >= MIN_SHARED_TECH;
  });
}
