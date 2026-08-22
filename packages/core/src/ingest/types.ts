/**
 * Shared types for the ingestion pipeline (#24).
 */

import type { Chunk } from "../chunking/types.js";

/** A chunk (#21) plus the embedding vector and model id it was embedded with — ready to write to the store. */
export interface EmbeddedChunk extends Chunk {
  embedding: number[];
  embeddingModel: string;
}

/** Structured summary printed on completion — makes re-index behavior visible in CI logs. */
export interface IngestSummary {
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** Number of `embed()` batch calls made (0 on the fully-incremental no-op path). */
  embeddingCalls: number;
  wallTimeMs: number;
  dryRun: boolean;
}
