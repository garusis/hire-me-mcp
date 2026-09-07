/**
 * Ingestion orchestration (#24): load career data -> chunk -> diff against
 * the store's fingerprints -> embed only what's needed -> write.
 *
 * ## Per-batch persistence (#317)
 *
 * `diff.toEmbed` is embedded and persisted in `persistBatchSize`-sized
 * batches: each batch is embedded, then immediately written with
 * `store.upsertMany` before the next batch starts. This deliberately
 * replaces #24's original "no partial commit on a permanent embedding
 * failure" guarantee — a paced free-tier ingest of ~190 texts can take
 * minutes and is expected to occasionally hit a timeout or a permanent
 * failure partway through (see issue #317). The new guarantee: **partial
 * progress is durable and resumable**, because the diff is fingerprint-
 * based (`./diff.ts`) — every row this function does persist is a
 * complete, correctly-embedded chunk, and the next run's diff sees it as
 * unchanged and skips re-embedding it, so an aborted run never re-spends
 * quota on work it already paid for.
 *
 * `store.deleteMany` still runs only after every batch has embedded and
 * persisted successfully — a permanent failure partway through leaves the
 * chunks slated for deletion untouched (still queryable) rather than
 * deleting them before their replacements are confirmed written.
 * `--dry-run` short-circuits even earlier, before the embedder is touched
 * at all.
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
  /**
   * Chunks embedded and persisted per batch (#317) — each batch is
   * embedded then immediately written with `store.upsertMany` before the
   * next batch starts, so partial progress survives an abort. Defaults to
   * 16 (matches the embedding client's own default batch size). Must be a
   * positive integer — anything <= 0 would make the batching loop never
   * advance.
   */
  persistBatchSize?: number;
  /**
   * Called after each batch's `store.upsertMany` completes, with the
   * cumulative count of chunks persisted so far this run and the total
   * number of chunks queued to embed (`diff.toEmbed.length`) — unlike the
   * paced embedder's own `onBatch` (which only sees one `embed()` call's
   * texts, always `persistBatchSize` at most), this reflects the whole
   * run's progress, which is what a CLI's `persisted X/Y chunks` log line
   * needs. Never called on a dry run or when there's nothing to embed.
   */
  onProgress?: (info: { persisted: number; total: number }) => void;
  /** Injectable clock for deterministic `wallTimeMs` in tests. Defaults to `Date.now`. */
  now?: () => number;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
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

  const persistBatchSize = options.persistBatchSize ?? 16;
  if (!Number.isInteger(persistBatchSize) || persistBatchSize <= 0) {
    throw new Error(`persistBatchSize (${persistBatchSize}) must be a positive integer.`);
  }
  let embeddingCalls = 0;
  let persisted = 0;
  const totalToEmbed = diff.toEmbed.length;
  for (const batch of chunkArray(diff.toEmbed, persistBatchSize)) {
    embeddingCalls += 1;
    const vectors = await options.embedder.embed(batch.map((chunk) => chunk.text));
    const embeddedBatch: EmbeddedChunk[] = batch.map((chunk, index) => ({
      ...chunk,
      // Deterministic ordering is `embedder.embed`'s contract (see
      // `embedding/client.ts`) — vectors[index] always belongs to
      // batch[index].
      embedding: vectors[index] as number[],
      embeddingModel: options.modelId,
    }));
    // Persist this batch immediately — see this module's docstring on why
    // that's now the durability guarantee instead of "embed everything,
    // then write everything".
    await options.store.upsertMany(embeddedBatch);
    persisted += embeddedBatch.length;
    options.onProgress?.({ persisted, total: totalToEmbed });
  }

  // Deletions only run once every batch above has embedded and persisted
  // successfully — see this module's docstring.
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
