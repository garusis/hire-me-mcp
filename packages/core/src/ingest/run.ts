/**
 * Ingestion orchestration (#24): load career data -> chunk -> diff against
 * the store's fingerprints -> embed only what's needed -> write everything
 * in one pass.
 *
 * Ordering matters for the "no partial commit on a permanent embedding
 * failure" acceptance criterion: `embedder.embed()` is awaited (and can
 * throw) *before* `store.upsertMany`/`store.deleteMany` are ever called —
 * so a permanent embedding failure propagates out of this function having
 * made zero writes, with no need for a rollback. `--dry-run` short-circuits
 * even earlier, before the embedder is touched at all.
 */

import type { Chunk } from "../chunking/types.js";
import type { CareerDataRepository, CareerDataset } from "../repository.js";
import { computeIngestDiff } from "./diff.js";
import type { IngestStore } from "./store.js";
import type { EmbeddedChunk, IngestSummary } from "./types.js";

export interface IngestEmbedder {
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface RunIngestOptions {
  repository: CareerDataRepository;
  /** Injection point for the chunker — defaults are wired in `cli.ts`; tests pass a fake. */
  chunker: (dataset: CareerDataset) => Chunk[];
  embedder: IngestEmbedder;
  store: IngestStore;
  /** The currently configured embedding model id — stored per row, compared against on the next run. */
  modelId: string;
  /** Report the diff without embedding or writing anything. Defaults to `false`. */
  dryRun?: boolean;
  /** Re-embed every chunk regardless of hash/model match. Defaults to `false`. */
  full?: boolean;
  /** Injectable clock for deterministic `wallTimeMs` in tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** Runs one full incremental ingestion pass and returns a structured summary. */
export async function runIngest(options: RunIngestOptions): Promise<IngestSummary> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const dryRun = options.dryRun ?? false;

  const dataset = options.repository.getDataset();
  const freshChunks = options.chunker(dataset);
  const existingFingerprints = await options.store.listFingerprints();
  const diff = computeIngestDiff(freshChunks, existingFingerprints, {
    modelId: options.modelId,
    full: options.full ?? false,
  });

  if (dryRun) {
    return {
      inserted: diff.toInsert.length,
      updated: diff.toUpdate.length,
      deleted: diff.toDelete.length,
      unchanged: diff.unchanged.length,
      embeddingCalls: 0,
      wallTimeMs: now() - startedAt,
      dryRun: true,
    };
  }

  let embeddingCalls = 0;
  let embedded: EmbeddedChunk[] = [];
  if (diff.toEmbed.length > 0) {
    embeddingCalls += 1;
    const vectors = await options.embedder.embed(diff.toEmbed.map((chunk) => chunk.text));
    embedded = diff.toEmbed.map((chunk, index) => ({
      ...chunk,
      // Deterministic ordering is `embedder.embed`'s contract (see
      // `embedding/client.ts`) — vectors[index] always belongs to
      // diff.toEmbed[index].
      embedding: vectors[index] as number[],
      embeddingModel: options.modelId,
    }));
  }

  // Embedding is fully done (or there was nothing to embed) before any
  // write happens — see this module's docstring.
  if (embedded.length > 0) {
    await options.store.upsertMany(embedded);
  }
  if (diff.toDelete.length > 0) {
    await options.store.deleteMany(diff.toDelete);
  }

  return {
    inserted: diff.toInsert.length,
    updated: diff.toUpdate.length,
    deleted: diff.toDelete.length,
    unchanged: diff.unchanged.length,
    embeddingCalls,
    wallTimeMs: now() - startedAt,
    dryRun: false,
  };
}
