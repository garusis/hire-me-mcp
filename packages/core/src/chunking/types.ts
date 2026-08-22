/**
 * Types for the career-data chunker (#21).
 *
 * `Chunk`'s fields are deliberately shaped to map cleanly onto the pgvector
 * chunk table defined in parallel by #14 — see that issue's column list
 * (`id`, `source_type`, `source_id`, `chunk_index`, `citation` jsonb,
 * `content`, `content_hash`, `embedding vector(N)`, `token_count`, plus
 * timestamps). This module owns every one of those columns except
 * `embedding` and the timestamps, which are added by the ingestion pipeline
 * (#24) when a chunk is embedded and upserted — chunking itself never talks
 * to an embedding model or a database. The mapping is camelCase here,
 * snake_case there:
 *
 * | `Chunk` field  | pgvector column |
 * | -------------- | ---------------- |
 * | `id`           | `id`             |
 * | `sourceType`   | `source_type`    |
 * | `sourceId`     | `source_id`      |
 * | `chunkIndex`   | `chunk_index`    |
 * | `text`         | `content`        |
 * | `contentHash`  | `content_hash`   |
 * | `tokenCount`   | `token_count`    |
 * | `citation`     | `citation` (jsonb) |
 */

import type { CitableEntityType, Citation } from "@hire-me-mcp/career-data";

export type { CitableEntityType };

/**
 * A chunk's citation: the same `{ entityType, entityId, fragment?, label }`
 * shape as `@hire-me-mcp/career-data`'s `Citation` (kept identical so the
 * `entityType`/`entityId` names line up 1:1 with the interview agent's
 * `[cite:<entityType>:<entityId>#<fragment>]` marker format — see
 * `packages/agent/src/citations.ts`), plus an optional `url` for a
 * canonical external link (e.g. a `WritingEntry`'s `url`, a `Project`'s
 * first link) when the source record has one.
 *
 * `fragment` is populated only when an entity produced more than one chunk
 * (`fragment: "chunk-<chunkIndex>"`) — a single-chunk entity's citation
 * addresses the whole record, needing no sub-anchor.
 */
export interface ChunkCitation extends Citation {
  /** Canonical external URL for the source record, when it has one. */
  url?: string;
}

/**
 * Metadata carried alongside a chunk for filtering search results before or
 * after scoring (e.g. "only experience at Acme", "only chunks tagged
 * postgres", "only chunks in this date range") — deliberately a plain,
 * mostly-optional bag rather than one field per possible filter, since
 * different entity types populate different subsets.
 */
export interface ChunkMetadata {
  /** Company/institution name, for `experience` and `education` chunks. */
  company?: string;
  /** Tech tags, skill category/proficiency, or related-skill ids — entity-type-dependent. */
  tags?: string[];
  /** Inclusive lower bound of the entity's date range (`YYYY-MM`/`YYYY-MM-DD`), when it has one. */
  dateFrom?: string;
  /** Inclusive upper bound of the entity's date range, when it has one (absent/undefined means open-ended). */
  dateTo?: string;
}

/**
 * One retrieval chunk: self-contained text plus everything needed to store
 * it (stable id, content hash, token count) and to cite it back to its
 * source record.
 */
export interface Chunk {
  /** Deterministic id: `sha256(sourceType:sourceId:chunkIndex)` — see `./hash.ts`. */
  id: string;
  /** Which entity-type schema `sourceId` belongs to. */
  sourceType: CitableEntityType;
  /** The source entity's own stable `id`. */
  sourceId: string;
  /** 0-based index of this chunk among all chunks produced from the same source entity. */
  chunkIndex: number;
  /** The chunk's normalized, ready-to-embed text (maps to the `content` column). */
  text: string;
  /** `sha256` of `text` (already normalized) — see `./hash.ts`. */
  contentHash: string;
  /** Estimated token count of `text` — see `./text.ts`'s `estimateTokens`. */
  tokenCount: number;
  /** Resolves this chunk back to the exact source record (and sub-part, if any) that produced it. */
  citation: ChunkCitation;
  /** Filtering metadata — see {@link ChunkMetadata}. */
  metadata: ChunkMetadata;
}

/** Configurable chunking parameters, in estimated tokens (see `./text.ts`'s `CHARS_PER_TOKEN`). */
export interface ChunkingOptions {
  /** Max chunk size in estimated tokens. Defaults to `DEFAULT_MAX_TOKENS` (320). */
  maxTokens?: number;
  /** Overlap between consecutive long-prose chunks, in estimated tokens. Defaults to `DEFAULT_OVERLAP_TOKENS` (48). */
  overlapTokens?: number;
}
