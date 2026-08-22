/**
 * Embedding client wrapper (#24): batches inputs into fixed-size groups,
 * retries a batch with exponential backoff on rate-limit/transient errors,
 * and preserves the input order in its output — `client.embed(texts)[i]`
 * is always the embedding for `texts[i]`, regardless of batch boundaries.
 *
 * The low-level `embedBatch` function is injected (see
 * {@link CreateEmbeddingClientOptions}) so this module has no direct
 * dependency on any AI SDK provider — that keeps retry/batching fully unit
 * testable with no network, and lets `createGoogleEmbeddingClient` (below)
 * be the only place that talks to `@ai-sdk/google`.
 */

export interface EmbeddingClient {
  /**
   * Embeds every input text, batching and retrying as configured. Returns
   * an array the same length as `texts`, in the same order. Never makes an
   * `embedBatch` call for an empty `texts` array.
   */
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** Thrown when embedding permanently fails — a non-retryable error, or retries exhausted. */
export class EmbeddingFailureError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "EmbeddingFailureError";
    this.cause = cause;
  }
}

export interface CreateEmbeddingClientOptions {
  /** Low-level batch embedder — real implementations call the provider's API. */
  embedBatch: (batch: readonly string[]) => Promise<number[][]>;
  /** Max texts per `embedBatch` call. Defaults to 16 (keeps free-tier batches small). */
  batchSize?: number;
  /** Max retry attempts per batch after the initial attempt. Defaults to 4. */
  maxRetries?: number;
  /** Delay before the first retry, doubled on each subsequent retry. Defaults to 500ms. */
  initialDelayMs?: number;
  /** Injectable sleep, so tests never actually wait. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BATCH_SIZE = 16;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_INITIAL_DELAY_MS = 500;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate =
    (error as { statusCode?: unknown; status?: unknown }).statusCode ??
    (error as { status?: unknown }).status;
  return typeof candidate === "number" ? candidate : undefined;
}

/** Rate limits (429) and server-side transient errors (5xx) are worth retrying; anything else isn't. */
function isRetryable(error: unknown): boolean {
  const status = statusCodeOf(error);
  if (status === 429) return true;
  return status !== undefined && status >= 500 && status < 600;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function toEmbeddingFailure(
  error: unknown,
  attempt: number,
  exhausted: boolean,
): EmbeddingFailureError {
  const message = error instanceof Error ? error.message : String(error);
  if (exhausted) {
    return new EmbeddingFailureError(
      `Embedding failed after ${attempt + 1} attempts: ${message}`,
      error,
    );
  }
  return new EmbeddingFailureError(
    `Embedding failed with a non-retryable error: ${message}`,
    error,
  );
}

async function attemptEmbedBatch(
  embedBatch: CreateEmbeddingClientOptions["embedBatch"],
  batch: readonly string[],
): Promise<number[][]> {
  const result = await embedBatch(batch);
  if (result.length !== batch.length) {
    throw new EmbeddingFailureError(
      `Embedding provider returned ${result.length} vectors for a batch of ${batch.length} inputs.`,
    );
  }
  return result;
}

async function embedBatchWithRetry(
  embedBatch: CreateEmbeddingClientOptions["embedBatch"],
  batch: readonly string[],
  maxRetries: number,
  initialDelayMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<number[][]> {
  let delay = initialDelayMs;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptEmbedBatch(embedBatch, batch);
    } catch (error) {
      if (error instanceof EmbeddingFailureError) throw error;
      const exhausted = attempt >= maxRetries;
      if (!isRetryable(error) || exhausted) {
        throw toEmbeddingFailure(error, attempt, exhausted);
      }
      await sleep(delay);
      delay *= 2;
    }
  }
}

/** Builds an {@link EmbeddingClient} around a low-level `embedBatch` function. */
export function createEmbeddingClient(options: CreateEmbeddingClientOptions): EmbeddingClient {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async embed(texts: readonly string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const batches = chunk(texts, batchSize);
      const results: number[][] = [];
      // Sequential (not concurrent) on purpose: keeps the free-tier request
      // rate low and guarantees deterministic ordering without needing to
      // re-sort results by batch index afterward.
      for (const batch of batches) {
        const embedded = await embedBatchWithRetry(
          options.embedBatch,
          batch,
          maxRetries,
          initialDelayMs,
          sleep,
        );
        results.push(...embedded);
      }
      return results;
    },
  };
}
