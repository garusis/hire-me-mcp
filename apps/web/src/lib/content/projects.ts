/**
 * Typed accessor for project listing/detail views.
 *
 * `packages/core` exposes no dedicated "list all projects" service — only
 * `searchProjects(query, options?)`, which is deterministic *ranked search*
 * (it returns nothing for an empty query, by design). Listing every project
 * unranked, and looking one up by slug, is not search — so this reads the
 * dataset via `packages/core`'s own `CareerDataRepository` seam and reuses
 * its `buildCitation` helper, the same way `searchProjects` itself builds
 * its citations, rather than hand-rolling citation construction here.
 */

import "server-only";
import type { Citation, Project } from "@hire-me-mcp/career-data";
import { buildCitation, type CareerDataRepository } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";
import { findBySlug, listSlugs, type SlugLookup, toSlug } from "./slug";

/** One project list entry, paired with its stable slug and citation. */
export interface ProjectListItemView {
  slug: string;
  project: Project;
  citation: Citation;
}

export interface ProjectListView {
  items: ProjectListItemView[];
  citations: Citation[];
}

/** A single project plus its citation, or the documented not-found result. */
export type ProjectDetailView = SlugLookup<{ project: Project; citation: Citation }>;

function toListItem(repository: CareerDataRepository, project: Project): ProjectListItemView {
  return {
    slug: toSlug(project.id),
    project,
    citation: buildCitation(repository, "project", project.id),
  };
}

/** Every project, unranked, each paired with its slug and a citation to itself. */
export function getProjectsListView(): ProjectListView {
  const repository = getCareerDataRepository();
  const items = repository.getDataset().projects.map((project) => toListItem(repository, project));
  return { items, citations: items.map((item) => item.citation) };
}

/** Every project slug, for `generateStaticParams`. */
export function listProjectSlugs(): string[] {
  return listSlugs(getCareerDataRepository().getDataset().projects, (project) => project.id);
}

/**
 * A single project by slug. Returns the documented not-found result
 * (`{ found: false, slug }`) for an unrecognized slug rather than throwing.
 */
export function getProjectDetailView(slug: string): ProjectDetailView {
  const repository = getCareerDataRepository();
  const lookup = findBySlug(repository.getDataset().projects, slug, (project) => project.id);
  if (!lookup.found) {
    return lookup;
  }
  const citation = buildCitation(repository, "project", lookup.value.id);
  return { found: true, slug, value: { project: lookup.value, citation } };
}
