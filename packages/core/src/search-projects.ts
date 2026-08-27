/**
 * `searchProjects(repository, query, options?)` — the first consumer of the
 * reusable `./search/` module (#55). Deterministic keyword/tag search over
 * `Project` entries: no embeddings, no randomness, no semantic ranking (that
 * is epic #6, deliberately out of scope here) — the same query against the
 * same dataset always ranks the same way. See README.md for the fully
 * documented scoring rule.
 */

import type { CitableEntityType, Project } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";
import { buildAliasIndex } from "./search/alias-resolver.js";
import { type MatchExplanation, search } from "./search/engine.js";
import { tokenize } from "./search/normalize.js";

/**
 * Field weights for project search, applied in this order of precedence —
 * **the documented scoring rule**: an exact tag match outweighs a name
 * match, which outweighs a summary match, which outweighs a body match. Each
 * distinct matched query token contributes its field's weight once per
 * field (see `./search/engine.js` for the exact summation rule); a
 * document's total score is the sum across every matching (field, token)
 * pair.
 */
const FIELD_WEIGHTS = {
  tag: 100,
  name: 50,
  summary: 20,
  body: 5,
} as const;

export interface SearchProjectsOptions {
  /** Maximum number of results to return, applied after ranking (does not change relative order). */
  limit?: number;
  /**
   * Restricts candidates to projects with at least one of the given tags
   * (OR semantics across the list — the same convention as `getExperience`'s
   * `tech` filter) before scoring. Each given tag is resolved through the
   * same skill-alias index the query itself is resolved through, so
   * `"postgres"` and `"postgresql"` pre-filter identically. Omitted or an
   * empty array imposes no constraint.
   */
  tags?: string[];
}

/** One ranked project match: the project itself, its score, and why it matched. */
export interface ProjectSearchResult {
  project: Project;
  score: number;
  matches: MatchExplanation[];
}

function buildTagAliasIndex(repository: CareerDataRepository) {
  const { skills } = repository.getDataset();
  return buildAliasIndex(
    skills.map((skill) => ({ canonical: skill.id, aliases: [skill.name, ...skill.aliases] })),
  );
}

/**
 * Expands raw query tokens with any tag each token resolves to via
 * `aliasIndex` (e.g. `"ts"` -> also search for `"typescript"`), so a query
 * naming an alias matches project tags/text the same way the canonical tag
 * would. Also tries the whole normalized query as one multi-word phrase, so
 * a multi-word alias (e.g. `"amazon web services"`) resolves too. Original
 * tokens are always kept — resolution only adds, never replaces.
 */
function expandWithResolvedTags(
  rawTokens: string[],
  aliasIndex: ReturnType<typeof buildTagAliasIndex>,
): string[] {
  const expanded = new Set(rawTokens);
  for (const token of rawTokens) {
    const resolved = aliasIndex.resolve(token);
    if (resolved !== undefined) {
      expanded.add(resolved);
    }
  }
  const wholePhraseResolved = aliasIndex.resolve(rawTokens.join(" "));
  if (wholePhraseResolved !== undefined) {
    expanded.add(wholePhraseResolved);
  }
  return Array.from(expanded);
}

function resolveTag(tag: string, aliasIndex: ReturnType<typeof buildTagAliasIndex>): string {
  return aliasIndex.resolve(tag) ?? tokenize(tag).join("-");
}

function buildProjectDocument(project: Project) {
  return {
    id: project.id,
    fields: [
      { name: "tag", weight: FIELD_WEIGHTS.tag, tokens: project.tech },
      { name: "name", weight: FIELD_WEIGHTS.name, tokens: tokenize(project.name) },
      { name: "summary", weight: FIELD_WEIGHTS.summary, tokens: tokenize(project.summary) },
      { name: "body", weight: FIELD_WEIGHTS.body, tokens: tokenize(project.body) },
    ],
  };
}

/**
 * Deterministic keyword/tag search over the repository's `Project` entries.
 *
 * `query` is normalized and tokenized (case folding, punctuation stripping,
 * diacritic stripping, whitespace collapsing — see `./search/normalize.js`),
 * then each token is additionally resolved against a controlled-vocabulary
 * alias index built from the dataset's skills, so an alias (`"ts"`,
 * `"postgres"`) matches the same projects as its canonical tag
 * (`"typescript"`, `"postgresql"`) would.
 *
 * `options.tags`, if given, pre-filters candidate projects to those with at
 * least one of the given tags (resolved the same way) before scoring.
 * `options.limit` truncates the ranked results afterward without changing
 * their relative order.
 *
 * `query` is optional (#275): a **tag-only** search — no query, or an empty
 * or whitespace-only one, plus a non-empty `options.tags` — ranks the
 * tag-filtered candidates by those tags instead, so every project carrying
 * a requested tag comes back with an ordinary `tag` match explanation. This
 * is what the tools built on top advertise ("by keyword and/or technology
 * tag"): either argument alone is a valid search.
 *
 * Returns `{ data: [], citations: [] }` — never throws — when there is
 * neither a usable query nor any tag to search by, or when nothing matches.
 * Every returned result carries a citation resolving to its project
 * (`citations[i]` corresponds to `data[i]`).
 */
export function searchProjects(
  repository: CareerDataRepository,
  query: string | undefined,
  options: SearchProjectsOptions = {},
): DomainResult<ProjectSearchResult[]> {
  const { projects } = repository.getDataset();
  const aliasIndex = buildTagAliasIndex(repository);

  const resolvedTags = (options.tags ?? []).map((tag) => resolveTag(tag, aliasIndex));
  const candidateProjects =
    resolvedTags.length === 0
      ? projects
      : projects.filter((project) => project.tech.some((tag) => resolvedTags.includes(tag)));

  const rawTokens = tokenize(query ?? "");
  // No usable query: fall back to searching for the requested tags
  // themselves, which ranks (and explains) every candidate the pre-filter
  // already selected. With neither a query nor tags there is nothing to
  // search for at all.
  const queryTokens =
    rawTokens.length === 0 ? resolvedTags : expandWithResolvedTags(rawTokens, aliasIndex);
  if (queryTokens.length === 0) {
    return createDomainResult([], []);
  }

  const documents = candidateProjects.map(buildProjectDocument);
  const matches = search(documents, queryTokens, { limit: options.limit });

  const projectsById = new Map(candidateProjects.map((project) => [project.id, project]));
  const results: ProjectSearchResult[] = matches.map((match) => {
    const project = projectsById.get(match.id);
    if (project === undefined) {
      throw new Error(`search-projects: matched id "${match.id}" not found among candidates`);
    }
    return { project, score: match.score, matches: match.matches };
  });

  const citations = results.map((result) => {
    const entityType: CitableEntityType = "project";
    return buildCitation(repository, entityType, result.project.id);
  });

  return createDomainResult(results, citations);
}
