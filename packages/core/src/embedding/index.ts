/**
 * Public surface of the embedding module (#24), exposed as
 * `@hire-me-mcp/core/embedding` — a separate subpath (mirroring `./db`) so
 * consumers that don't need an embedding provider client don't pull in
 * `@ai-sdk/google`/`ai` just by importing `@hire-me-mcp/core`.
 *
 * Consumers: the ingestion pipeline (#24, `src/ingest/`) and `searchCareer`
 * (#34) — both must resolve the model id/dimension from here, never as a
 * duplicated literal.
 */

export type {
  CreateEmbeddingClientOptions,
  EmbeddingClient,
} from "./client.js";
export { createEmbeddingClient, EmbeddingFailureError } from "./client.js";
export { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_PROVIDER } from "./config.js";
export type { CreateGoogleEmbeddingClientOptions } from "./google-client.js";
export { createGoogleEmbeddingClient } from "./google-client.js";
