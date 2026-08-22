/**
 * Pure incremental-ingestion diff (#24): compares freshly computed chunks
 * (from `chunkCareerData`) against the store's cheap fingerprints
 * (`listChunkFingerprints` — id/contentHash/embeddingModel, no
 * embedding/content fetch) and classifies every chunk into exactly one of
 * `toInsert` / `toUpdate` / `unchanged`, plus every stale store id into
 * `toDelete`.
 *
 * No I/O: this module never touches the database or an embedding
 * provider, which is what makes it unit-testable with hand-built fixtures
 * (see `diff.test.ts`) and is the seam the "unchanged content -> zero
 * embedding calls" acceptance criterion is verified against — the
 * orchestrator (`run.ts`) only calls the embedder for `toEmbed`.
 */

import type { Chunk } from "../chunking/types.js";
import type { ChunkFingerprint } from "../db/chunks-repository.js";

export interface ComputeIngestDiffOptions {
  /** The currently configured embedding model id (`EMBEDDING_MODEL_ID`). */
  modelId: string;
  /** When `true`, every chunk is classified as insert/update regardless of hash or model match (`--full`). */
  full?: boolean;
}

export interface IngestDiff {
  /** Chunks with no existing row — brand new source content. */
  toInsert: Chunk[];
  /** Chunks with an existing row whose contentHash or embeddingModel no longer matches. */
  toUpdate: Chunk[];
  /** Ids of existing rows with no corresponding fresh chunk — their source record disappeared. */
  toDelete: string[];
  /** Chunks whose existing row already has the same contentHash and embeddingModel — nothing to do. */
  unchanged: Chunk[];
  /** `toInsert` and `toUpdate` combined, in original dataset order — exactly what needs embedding. */
  toEmbed: Chunk[];
}

/**
 * Classifies every `freshChunks` entry against `existingFingerprints` and
 * reports which existing ids are now orphaned.
 */
export function computeIngestDiff(
  freshChunks: readonly Chunk[],
  existingFingerprints: readonly ChunkFingerprint[],
  options: ComputeIngestDiffOptions,
): IngestDiff {
  const existingById = new Map(existingFingerprints.map((fp) => [fp.id, fp]));
  const freshIds = new Set(freshChunks.map((chunk) => chunk.id));

  const toInsert: Chunk[] = [];
  const toUpdate: Chunk[] = [];
  const unchanged: Chunk[] = [];
  const toEmbed: Chunk[] = [];

  for (const chunk of freshChunks) {
    const existing = existingById.get(chunk.id);
    if (existing === undefined) {
      toInsert.push(chunk);
      toEmbed.push(chunk);
      continue;
    }
    const matches =
      !options.full &&
      existing.contentHash === chunk.contentHash &&
      existing.embeddingModel === options.modelId;
    if (matches) {
      unchanged.push(chunk);
    } else {
      toUpdate.push(chunk);
      toEmbed.push(chunk);
    }
  }

  const toDelete = existingFingerprints.filter((fp) => !freshIds.has(fp.id)).map((fp) => fp.id);

  return { toInsert, toUpdate, toDelete, unchanged, toEmbed };
}
