/**
 * `chunkCareerData(dataset, options?)` — the career-data chunker (#21).
 *
 * A pure function: no I/O, no network, no `process.env` access. It
 * consumes the typed `CareerDataset` domain layer produced by
 * `@hire-me-mcp/career-data` (never raw content files — that would make
 * this a second source of truth) and returns an ordered `Chunk[]` covering
 * every entity in the dataset, each with a deterministic id, a content
 * hash, a citation, and filtering metadata. See `./types.ts` for the
 * `Chunk` shape and its mapping onto the #14 pgvector table, and
 * `./render.ts` for how each entity type renders to text.
 *
 * **Strategy.** Every entity renders to a `header` (short, always
 * self-contained: title/company/dates/tags) plus an optional `body`
 * (long-form prose, for `project`/`writing`). The two are joined and fed
 * through the same token-budgeted splitter (`splitLongText`, see
 * `./text.ts`) regardless of entity type:
 * - A short structured record (experience, skill, gap, education, profile)
 *   almost always produces exactly **one** chunk, because its rendered
 *   text comfortably fits under the token budget — but it is never
 *   *hard-coded* to one chunk: if a future entry's highlights/evidence list
 *   grew long enough to exceed the budget, it would still split, honoring
 *   the "no chunk exceeds the configured max token budget" invariant
 *   unconditionally.
 * - A long-prose record (project/writing) splits into as many
 *   paragraph/sentence-bounded, overlapping chunks as its body needs.
 *
 * **Determinism.** Chunk ids are `sha256(sourceType:sourceId:chunkIndex)`
 * (see `./hash.ts`), and `contentHash` is `sha256` of the chunk's own
 * normalized text. Neither depends on wall-clock time, randomness, or
 * anything outside `dataset` and `options` — running this function twice
 * on the same input, in the same process or a different one, produces
 * byte-identical output. Editing one source record changes only that
 * record's rendered text, and therefore only that record's chunk(s); every
 * other entity's chunks are computed independently and come out
 * byte-identical.
 */

import type {
  CareerDataset,
  CitableEntityType,
  EducationEntry,
  ExperienceEntry,
  Gap,
  Profile,
  Project,
  Skill,
  WritingEntry,
} from "@hire-me-mcp/career-data";
import { computeChunkId, computeContentHash } from "./hash.js";
import {
  type RenderedEntity,
  renderEducation,
  renderExperience,
  renderGap,
  renderProfile,
  renderProject,
  renderSkill,
  renderWriting,
} from "./render.js";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  estimateTokens,
  normalizeText,
  splitLongText,
} from "./text.js";
import type { Chunk, ChunkCitation, ChunkingOptions } from "./types.js";

export { computeChunkId, computeContentHash } from "./hash.js";
export {
  CHARS_PER_TOKEN,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  estimateTokens,
  normalizeText,
} from "./text.js";
export type { Chunk, ChunkCitation, ChunkingOptions, ChunkMetadata } from "./types.js";

interface ResolvedOptions {
  maxTokens: number;
  overlapTokens: number;
}

function resolveOptions(options: ChunkingOptions | undefined): ResolvedOptions {
  return {
    maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    overlapTokens: options?.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
  };
}

function buildCitation(
  sourceType: CitableEntityType,
  sourceId: string,
  rendered: RenderedEntity,
  chunkIndex: number,
  chunkCount: number,
): ChunkCitation {
  return {
    entityType: sourceType,
    entityId: sourceId,
    label: rendered.label,
    ...(rendered.url === undefined ? {} : { url: rendered.url }),
    ...(chunkCount > 1 ? { fragment: `chunk-${chunkIndex}` } : {}),
  };
}

/**
 * Renders one entity into its `Chunk[]` — the shared path every per-entity
 * helper (`chunkProfile`, `chunkExperience`, ...) and `chunkCareerData`
 * itself funnel through, so every entity type is chunked, hashed, and
 * cited identically.
 */
function buildEntityChunks(
  sourceType: CitableEntityType,
  sourceId: string,
  rendered: RenderedEntity,
  options: ResolvedOptions,
): Chunk[] {
  const joined = [rendered.header, rendered.body]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
  const fullText = normalizeText(joined);
  const pieces = splitLongText(fullText, options.maxTokens, options.overlapTokens);

  return pieces.map((text, chunkIndex) => ({
    id: computeChunkId(sourceType, sourceId, chunkIndex),
    sourceType,
    sourceId,
    chunkIndex,
    text,
    contentHash: computeContentHash(text),
    tokenCount: estimateTokens(text),
    citation: buildCitation(sourceType, sourceId, rendered, chunkIndex, pieces.length),
    metadata: rendered.metadata,
  }));
}

/** Chunks a single `Profile` (the dataset's singleton). */
export function chunkProfile(profile: Profile, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("profile", profile.id, renderProfile(profile), resolveOptions(options));
}

/** Chunks a single `ExperienceEntry`. */
export function chunkExperience(entry: ExperienceEntry, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks(
    "experience",
    entry.id,
    renderExperience(entry),
    resolveOptions(options),
  );
}

/** Chunks a single `Project`, splitting its long-form `body` as needed. */
export function chunkProject(project: Project, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("project", project.id, renderProject(project), resolveOptions(options));
}

/** Chunks a single `Skill`. */
export function chunkSkill(skill: Skill, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("skill", skill.id, renderSkill(skill), resolveOptions(options));
}

/** Chunks a single `Gap`. */
export function chunkGap(gap: Gap, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("gap", gap.id, renderGap(gap), resolveOptions(options));
}

/** Chunks a single `EducationEntry`. */
export function chunkEducation(entry: EducationEntry, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("education", entry.id, renderEducation(entry), resolveOptions(options));
}

/** Chunks a single `WritingEntry`, splitting its long-form `body` as needed. */
export function chunkWriting(entry: WritingEntry, options?: ChunkingOptions): Chunk[] {
  return buildEntityChunks("writing", entry.id, renderWriting(entry), resolveOptions(options));
}

/**
 * Chunks an entire `CareerDataset`: every entity across every entity type,
 * in dataset order (profile, then experience, projects, skills, gaps,
 * education, writing — each array in the order the dataset provides it).
 * A dataset with no profile authored yet simply contributes no profile
 * chunk, rather than throwing — this function never throws for "nothing
 * authored", the same convention `emptyCareerDataset()` establishes
 * elsewhere in `packages/core`.
 */
export function chunkCareerData(dataset: CareerDataset, options?: ChunkingOptions): Chunk[] {
  const resolved = resolveOptions(options);
  const chunks: Chunk[] = [];

  if (dataset.profile !== undefined) {
    chunks.push(
      ...buildEntityChunks("profile", dataset.profile.id, renderProfile(dataset.profile), resolved),
    );
  }
  for (const entry of dataset.experience) {
    chunks.push(...buildEntityChunks("experience", entry.id, renderExperience(entry), resolved));
  }
  for (const project of dataset.projects) {
    chunks.push(...buildEntityChunks("project", project.id, renderProject(project), resolved));
  }
  for (const skill of dataset.skills) {
    chunks.push(...buildEntityChunks("skill", skill.id, renderSkill(skill), resolved));
  }
  for (const gap of dataset.gaps) {
    chunks.push(...buildEntityChunks("gap", gap.id, renderGap(gap), resolved));
  }
  for (const entry of dataset.education) {
    chunks.push(...buildEntityChunks("education", entry.id, renderEducation(entry), resolved));
  }
  for (const entry of dataset.writing) {
    chunks.push(...buildEntityChunks("writing", entry.id, renderWriting(entry), resolved));
  }

  return chunks;
}
