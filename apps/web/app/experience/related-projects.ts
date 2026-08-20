import type { ProjectListItemView } from "../../src/lib/content";

/**
 * A single shared tag (e.g. "typescript" or "nodejs") is too generic a
 * signal on this data set — most experience entries and most projects carry
 * at least one of a handful of common language/platform tags, which would
 * make nearly everything "related" to everything else. Two or more shared
 * tags is a meaningfully stronger, still purely data-driven, signal.
 */
const MIN_SHARED_TECH = 2;

/**
 * Projects that share at least {@link MIN_SHARED_TECH} `tech` values with an
 * experience entry — the data-driven cross-link between `/experience` and
 * `/projects/[slug]`. Neither `ExperienceEntry` nor `Project` carries an
 * explicit relation field, so the relation the content expresses is tech
 * overlap, computed here rather than hardcoded per entry. Preserves
 * `projects`' own order.
 */
export function getRelatedProjects(
  entryTech: readonly string[],
  projects: readonly ProjectListItemView[],
): ProjectListItemView[] {
  const entryTechSet = new Set(entryTech);
  return projects.filter((item) => {
    const sharedCount = item.project.tech.filter((tag) => entryTechSet.has(tag)).length;
    return sharedCount >= MIN_SHARED_TECH;
  });
}
