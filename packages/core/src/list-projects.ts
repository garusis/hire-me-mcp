/**
 * `listProjects(repository, options?)` — deterministic project enumeration
 * (#214): every `Project` record (including the full MDX `body`) in a
 * stable order, optionally pre-filtered by tags resolved through the same
 * skill-alias index `searchProjects` uses. No scores, no ranking — this
 * complements, not replaces, the keyword-ranked `searchProjects`. See
 * README.md for the full documented semantics.
 */

import type { Project } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";
import { buildAliasIndex } from "./search/alias-resolver.js";
import { tokenize } from "./search/normalize.js";

export interface ListProjectsOptions {
  /**
   * Restricts results to projects with at least one of the given tags (OR
   * semantics across the list — the same convention as `searchProjects`'s
   * `tags` option). Each given tag is resolved through the same skill-alias
   * index `searchProjects` uses, so `"postgres"` and `"postgresql"` filter
   * identically. Omitted or an empty array imposes no constraint.
   */
  tags?: string[];
}

/** Stable sort order: `id` ascending — fully deterministic regardless of input array order. */
function compareProjects(a: Project, b: Project): number {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function buildTagAliasIndex(repository: CareerDataRepository) {
  const { skills } = repository.getDataset();
  return buildAliasIndex(
    skills.map((skill) => ({ canonical: skill.id, aliases: [skill.name, ...skill.aliases] })),
  );
}

function resolveTag(tag: string, aliasIndex: ReturnType<typeof buildTagAliasIndex>): string {
  return aliasIndex.resolve(tag) ?? tokenize(tag).join("-");
}

/**
 * Returns every {@link Project} in `repository`'s dataset — full records,
 * including the MDX `body` — sorted per {@link compareProjects}. When
 * `options.tags` is given and non-empty, only projects carrying at least
 * one of the given tags (each resolved through the skill-alias index, the
 * exact resolution `searchProjects` applies) are returned. `citations[i]`
 * is a citation to `data[i]`'s project (label = project name). A tags
 * filter matching nothing returns an empty list and an empty citation
 * array — never throws.
 */
export function listProjects(
  repository: CareerDataRepository,
  options: ListProjectsOptions = {},
): DomainResult<Project[]> {
  const { projects } = repository.getDataset();

  let matched = projects;
  if (options.tags !== undefined && options.tags.length > 0) {
    const aliasIndex = buildTagAliasIndex(repository);
    const resolvedTags = options.tags.map((tag) => resolveTag(tag, aliasIndex));
    matched = projects.filter((project) => project.tech.some((tag) => resolvedTags.includes(tag)));
  }

  const sorted = [...matched].sort(compareProjects);
  const citations = sorted.map((project) => buildCitation(repository, "project", project.id));
  return createDomainResult(sorted, citations);
}
