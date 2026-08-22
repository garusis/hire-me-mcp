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

/**
 * The identifier stored in `career_chunks.embedding_model` and compared
 * against by `searchCareer`'s stored-vs-configured mismatch guard
 * (`StoredEmbeddingModelMismatchError`, `search-career.ts`) and the
 * ingestion diff (`ingest/diff.ts`). Deliberately **not** the same value as
 * {@link EMBEDDING_MODEL_ID} — that constant is the literal Google API
 * model id, passed straight to `google.embedding(...)`, and must never
 * carry extra suffixes an API call wouldn't recognize.
 *
 * Any change to how a vector is produced from the same input text — not
 * just a different underlying model, but also a different `taskType` or
 * output dimension — changes the vector space, so old and new embeddings
 * are no longer comparable by cosine similarity. Bumping this identifier
 * (the `/task-v1` suffix here) is how that's surfaced: it makes every
 * previously-stored row look "stale" to `ingest/diff.ts`, forcing a full
 * re-embed on the next `pnpm ingest` run, and makes `searchCareer` refuse
 * to query against any row that hasn't been re-embedded yet rather than
 * silently returning cosine-similarity garbage across two incompatible
 * vector spaces.
 *
 * This suffix was bumped to `task-v1` when per-call Gemini `taskType`
 * support was added (`RETRIEVAL_DOCUMENT` at ingestion, `RETRIEVAL_QUERY`
 * at query time, see `google-client.ts`) — see the retrieval eval report
 * that motivated it for the before/after score distributions.
 */
export const STORED_EMBEDDING_MODEL_ID = `${EMBEDDING_MODEL_ID}/${EMBEDDING_DIMENSION}/task-v1`;
