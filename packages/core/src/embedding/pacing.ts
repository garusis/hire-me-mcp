/**
 * Ingestion-side pacing for the embedding client (#317) — a thin wrapper
 * around any `{ embed(texts) }`-shaped client (see `client.ts`'s
 * `EmbeddingClient`) that keeps the *texts embedded per minute* under a
 * configured limit, independent of the retry/backoff logic in `client.ts`.
 *
 * Why this exists alongside `client.ts`'s retry: PR #311 makes 429s
 * retryable and honours the server's `retryDelay`, which is a safety net
 * for *unexpected* bursts. It doesn't stop an ingest of 188 texts from
 * immediately exceeding Gemini's free-tier
 * `EmbedContentRequestsPerMinutePerUserPerProjectPerModel` limit (100,
 * counted in *texts*, not calls) on the very first few batches — see
 * issue #317. This module paces requests so that limit is never tripped in
 * the first place.
 *
 * Algorithm: a sliding 60s window of `{ at, count }` entries, one per
 * batch actually sent. Before sending a batch of `n` texts, drop window
 * entries older than 60s, then if `windowTotal + n` would exceed
 * `maxTextsPerMinute`, sleep until the oldest entry ages out and re-check
 * (more than one entry may need to expire before `n` fits). Batches are
 * sent strictly sequentially (never concurrently), so the window is
 * trivially single-threaded.
 *
 * Two known limits on what this actually guarantees:
 *
 * - **The window is per process, not per quota.** Each `createPacedEmbedder`
 *   call starts with an empty window, so it only paces calls made through
 *   that one instance. Two separate processes that spend the same Gemini
 *   project's quota (e.g. `pnpm ingest` immediately followed by
 *   `pnpm eval:retrieval` in the same CI job) are invisible to each
 *   other's windows and can together exceed the real per-minute limit even
 *   though each paced itself correctly in isolation — see
 *   `retrieval-eval.yml`'s "Let the embedding per-minute window clear"
 *   step, which sleeps a full window between the two processes for
 *   exactly this reason.
 * - **This is a plan, not a guarantee.** `client.ts`'s retry logic
 *   (PR #311) re-sends the same texts on a retryable failure, and each
 *   re-send counts against the quota again — but the pacer only records
 *   one window entry per `inner.embed` call, so a retried batch is
 *   undercounted here. The pacer keeps a *normal* run under the limit; the
 *   retry path is the actual safety net for the bursts it can't see.
 */

export interface PacedEmbedderOptions {
  /** Ceiling on texts embedded in any trailing 60s window. Must be a positive integer. */
  maxTextsPerMinute: number;
  /**
   * Texts per underlying `inner.embed` call. Defaults to 16 (matches
   * `client.ts`'s default). Must be a positive integer. If it's greater
   * than `maxTextsPerMinute`, the effective batch size is clamped down to
   * `maxTextsPerMinute` instead of erroring — a low
   * `EMBED_MAX_TEXTS_PER_MINUTE` just means smaller batches, not a crash.
   */
  batchSize?: number;
  /** Injectable clock, so tests never depend on real time. Defaults to `Date.now`. */
  now?: () => number;
  /** Injectable sleep, so tests never actually wait. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Called after each batch completes, with cumulative progress within
   * this one `embed(texts)` call — `total` is that call's `texts.length`,
   * not any larger caller-side total. Still valid for a single-call user
   * that wants `embedded X/Y` logging; a multi-call caller like
   * `runIngest` (which calls `embed` once per persistence batch) should
   * track cumulative progress itself instead — see `run.ts`'s
   * `onProgress` option.
   */
  onBatch?: (info: { embedded: number; total: number }) => void;
}

/**
 * `createPacedEmbedder`'s return type. Identical in shape to
 * `PaceableEmbedder` (the interface it wraps) — kept as a distinct name
 * for call-site clarity ("this is the paced one") while re-using the same
 * structural type, so the two stay interchangeable without extra casts.
 */
export type PacedEmbedder = PaceableEmbedder;

/** The minimal embedder shape `createPacedEmbedder` can wrap. */
export interface PaceableEmbedder {
  /** Same contract as `EmbeddingClient.embed`: same length/order as `texts`, no call for an empty array. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

const WINDOW_MS = 60_000;
const DEFAULT_BATCH_SIZE = 16;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Thrown when `maxTextsPerMinute` or `batchSize` isn't a positive integer —
 * either one being <= 0 would make `chunk`'s slicing loop through its
 * input without advancing (an infinite loop), so this is checked eagerly
 * instead of surfacing as a hang.
 */
export class InvalidPacingOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPacingOptionsError";
  }
}

/**
 * Wraps `inner` so its texts-per-60s stays under `options.maxTextsPerMinute`.
 * Splits `texts` into `options.batchSize`-sized batches and sends them to
 * `inner.embed` one at a time, sleeping before any batch that would push
 * the trailing-60s total over the limit.
 */
export function createPacedEmbedder(
  inner: PaceableEmbedder,
  options: PacedEmbedderOptions,
): PacedEmbedder {
  const requestedBatchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxTextsPerMinute = options.maxTextsPerMinute;
  if (!Number.isInteger(maxTextsPerMinute) || maxTextsPerMinute <= 0) {
    throw new InvalidPacingOptionsError(
      `maxTextsPerMinute (${maxTextsPerMinute}) must be a positive integer.`,
    );
  }
  if (!Number.isInteger(requestedBatchSize) || requestedBatchSize <= 0) {
    throw new InvalidPacingOptionsError(
      `batchSize (${requestedBatchSize}) must be a positive integer.`,
    );
  }
  // A `batchSize` greater than `maxTextsPerMinute` would mean no single
  // batch could ever fit under the limit — clamp down instead of erroring,
  // so a low EMBED_MAX_TEXTS_PER_MINUTE just shrinks the batch.
  const batchSize = Math.min(requestedBatchSize, maxTextsPerMinute);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  // One entry per batch actually sent.
  const window: { at: number; count: number }[] = [];

  function pruneWindow(currentTime: number): void {
    while (window.length > 0 && (window[0] as { at: number }).at <= currentTime - WINDOW_MS) {
      window.shift();
    }
  }

  function windowTotal(): number {
    return window.reduce((sum, entry) => sum + entry.count, 0);
  }

  async function waitForCapacity(n: number): Promise<void> {
    for (;;) {
      pruneWindow(now());
      if (windowTotal() + n <= maxTextsPerMinute) return;
      const oldest = window[0];
      // The window can't be empty here: `n <= maxTextsPerMinute` is
      // guaranteed by the `batchSize = min(requestedBatchSize,
      // maxTextsPerMinute)` clamp above, so an empty window always fits
      // `n` and this branch is unreachable — kept only to satisfy the
      // type checker.
      if (oldest === undefined) return;
      const waitMs = oldest.at + WINDOW_MS - now();
      if (waitMs > 0) await sleep(waitMs);
    }
  }

  return {
    async embed(texts: readonly string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const batches = chunk(texts, batchSize);
      const results: number[][] = [];
      let embedded = 0;
      for (const batch of batches) {
        await waitForCapacity(batch.length);
        const vectors = await inner.embed(batch);
        if (vectors.length !== batch.length) {
          throw new Error(
            `Embedding batch size mismatch: sent ${batch.length} texts, got back ${vectors.length} vectors.`,
          );
        }
        // Timestamped at completion, not at send — the conservative
        // direction: it makes this batch's texts count against the window
        // for slightly longer (until 60s after the call finished, not
        // started), never shorter, so a slow inner call can only make the
        // pacer more cautious, never less.
        window.push({ at: now(), count: batch.length });
        results.push(...vectors);
        embedded += batch.length;
        options.onBatch?.({ embedded, total: texts.length });
      }
      return results;
    },
  };
}
