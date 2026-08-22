/**
 * Shared embedding model configuration (#24, consumed unchanged by #34's
 * `searchCareer`) — the single place the model identifier, provider, and
 * vector dimension are declared so ingestion and query-time embedding never
 * drift out of sync (a query embedded with a different model/dimension than
 * the stored chunks would silently corrupt similarity search).
 *
 * Model choice: Google's `gemini-embedding-001`, truncated (MRL) to 768
 * dimensions — see `packages/core/src/db/migrations.ts`'s ADR for the full
 * rationale (free tier headroom, MRL support, common pgvector HNSW size).
 * `EMBEDDING_DIMENSION` here and the `vector(N)` column width in
 * `migrations.ts` must be kept in lockstep by hand — there is no runtime
 * check tying a SQL column width to a TypeScript constant.
 */

/** AI SDK provider binding used to construct the embedding model. */
export const EMBEDDING_PROVIDER = "google" as const;

/** Pinned (not `-latest`) embedding model id — see the ADR above for why. */
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";

/** Output dimension after MRL truncation. Must match the `vector(N)` column in migrations.ts. */
export const EMBEDDING_DIMENSION = 768;
