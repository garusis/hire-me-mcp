/**
 * Google (`gemini-embedding-001`) implementation of {@link EmbeddingClient}
 * (#24). This is the only module that imports `@ai-sdk/google`/`ai` — the
 * retry/batching behavior lives in `client.ts` and is unit tested without
 * any AI SDK dependency; this module just supplies the low-level
 * `embedBatch` function `createEmbeddingClient` retries around.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import type { CreateEmbeddingClientOptions, EmbeddingClient } from "./client.js";
import { createEmbeddingClient } from "./client.js";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID } from "./config.js";

/**
 * Gemini embedding task type (see
 * https://ai.google.dev/gemini-api/docs/embeddings#task-types) — asymmetric
 * retrieval tasks give the corpus and the query *different* task types
 * (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`) so the model can specialize
 * each side's representation instead of embedding both with the same
 * (default, task-agnostic) instruction. Only the subset this project uses
 * is exposed here; the AI SDK's type is wider.
 */
export type GoogleEmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface CreateGoogleEmbeddingClientOptions {
  /** `GOOGLE_GENERATIVE_AI_API_KEY` — never logged. */
  apiKey: string;
  /** Defaults to {@link EMBEDDING_MODEL_ID}. Override only for tests. */
  modelId?: string;
  /** Defaults to {@link EMBEDDING_DIMENSION}. Override only for tests. */
  dimension?: number;
  /**
   * Gemini `taskType` for this client's calls — `RETRIEVAL_DOCUMENT` for
   * ingestion, `RETRIEVAL_QUERY` for `searchCareer`'s query-time embedding
   * (see this module's docstring). Omitted entirely from `providerOptions`
   * when not given, matching the API's task-agnostic default.
   */
  taskType?: GoogleEmbeddingTaskType;
  /** Passed through to {@link createEmbeddingClient} — batching/retry tuning. */
  batchSize?: CreateEmbeddingClientOptions["batchSize"];
  maxRetries?: CreateEmbeddingClientOptions["maxRetries"];
  initialDelayMs?: CreateEmbeddingClientOptions["initialDelayMs"];
  sleep?: CreateEmbeddingClientOptions["sleep"];
}

/**
 * Builds an {@link EmbeddingClient} backed by Google's embedding API via
 * the AI SDK, truncated (MRL) to `EMBEDDING_DIMENSION` via
 * `providerOptions.google.outputDimensionality` so the output matches the
 * `vector(768)` column from #14 exactly.
 */
export function createGoogleEmbeddingClient(
  options: CreateGoogleEmbeddingClientOptions,
): EmbeddingClient {
  const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
  const model = google.embedding(options.modelId ?? EMBEDDING_MODEL_ID);
  const dimension = options.dimension ?? EMBEDDING_DIMENSION;

  return createEmbeddingClient({
    batchSize: options.batchSize,
    maxRetries: options.maxRetries,
    initialDelayMs: options.initialDelayMs,
    sleep: options.sleep,
    embedBatch: async (batch) => {
      const { embeddings } = await embedMany({
        model,
        values: [...batch],
        providerOptions: {
          google: {
            outputDimensionality: dimension,
            ...(options.taskType !== undefined ? { taskType: options.taskType } : {}),
          },
        },
      });
      return embeddings;
    },
  });
}
