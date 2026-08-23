/**
 * Plain-SQL migrations for the Neon Postgres + pgvector career-chunk store
 * (#14), plus the pure "which migrations still need to run" logic the
 * runner (`migrate.ts`) applies against the real database.
 *
 * Each migration is a small, independently-runnable list of SQL statements
 * (not one multi-statement blob) so the runner can execute them one at a
 * time via the driver's parameterless `sql.unsafe()` inside a single
 * transaction per migration — see `migrate.ts` for why.
 */

export interface Migration {
  /** Stable, lexicographically ordered id (e.g. `001_init_pgvector_chunks`). */
  id: string;
  /** SQL statements applied in order, each already terminated with `;`. */
  statements: string[];
}

/**
 * ADR: embedding dimension and distance metric (#14, referenced by #34).
 *
 * - Dimension: 768. The chat/agent LLM default (see root `.env.example`) is
 *   Google's free tier; embeddings come from `gemini-embedding-001`, which
 *   supports Matryoshka Representation Learning (MRL) truncation — the
 *   model's native 3072-dim output can be safely truncated to a smaller,
 *   still-meaningful vector. 768 is the chosen truncation: well inside the
 *   free tier, a supported MRL size, and a common pgvector HNSW dimension
 *   with plenty of prior art.
 * - Distance metric: cosine. Embeddings from this model family are meant to
 *   be compared by cosine similarity (not raw L2 or dot product), so the
 *   pgvector column uses `vector_cosine_ops` for both the HNSW index and any
 *   query using the `<=>` (cosine distance) operator — `searchCareer` (#34)
 *   must use the same operator for the query plan to actually hit this
 *   index. Similarity is derived as `1 - cosine_distance`.
 * - Index: HNSW over IVFFlat — no training/list-count tuning required, good
 *   recall out of the box, and works well on Neon's free tier at the small
 *   corpus size this project's career content produces.
 */
const EMBEDDING_DIMENSION = 768;

const initPgvectorChunks: Migration = {
  id: "001_init_pgvector_chunks",
  statements: [
    "CREATE EXTENSION IF NOT EXISTS vector;",
    `CREATE TABLE IF NOT EXISTS career_chunks (
      id text PRIMARY KEY,
      source_type text NOT NULL,
      source_id text NOT NULL,
      chunk_index integer NOT NULL DEFAULT 0,
      citation jsonb NOT NULL,
      content text NOT NULL,
      content_hash text NOT NULL,
      token_count integer,
      embedding vector(${EMBEDDING_DIMENSION}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT career_chunks_source_chunk_unique UNIQUE (source_type, source_id, chunk_index)
    );`,
    // HNSW + vector_cosine_ops: see the ADR note above. IF NOT EXISTS keeps a
    // second run of this migration a no-op, satisfying the idempotent
    // "running it a second time is a no-op" acceptance criterion.
    `CREATE INDEX IF NOT EXISTS career_chunks_embedding_hnsw_idx
      ON career_chunks USING hnsw (embedding vector_cosine_ops);`,
  ],
};

/**
 * Adds `embedding_model` to `career_chunks` (#24): the id of the embedding
 * model that produced each row's `embedding` vector. The ingestion pipeline
 * (#24) compares this against the currently configured model id
 * (`@hire-me-mcp/core/embedding`'s `EMBEDDING_MODEL_ID`) to detect a model
 * change and re-embed affected rows rather than silently mixing vector
 * spaces in the same HNSW index. `NOT NULL DEFAULT ''` rather than
 * nullable: an empty string never matches a real model id, so pre-#24 rows
 * (there are none in practice — this ships alongside #24 — but the
 * `IF NOT EXISTS`/default keeps the migration safe to run against a
 * database that already has rows some other way) are treated as needing
 * re-embedding rather than requiring a NULL-aware comparison everywhere
 * else in the codebase.
 */
const addEmbeddingModel: Migration = {
  id: "002_add_embedding_model",
  statements: [
    "ALTER TABLE career_chunks ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT '';",
  ],
};

/**
 * Adds the two anonymized usage-analytics event tables (#79):
 * `analytics_tool_events` (one row per MCP tool call, or per tool the chat
 * agent invokes) and `analytics_question_events` (one row per chat
 * question). Both tables store only coarse, taxonomy-constrained labels —
 * never raw question text, raw tool arguments, IPs, or user agents; see
 * `packages/core/src/analytics/scrubber.ts`, which every write to these
 * tables must go through (`analytics-repository.ts`).
 *
 * No per-session/per-caller grouping key: the locked decision for #79 was
 * to omit session/caller grouping entirely rather than add a rotating
 * salted hash, since nothing this pipeline needs to answer (theme
 * distribution, tool outcome counts, latency) requires linking rows back
 * to the same visitor — see `packages/core/README.md`'s "Usage analytics"
 * section for the documented rationale.
 *
 * Indexes: `created_at` alone supports the retention job's "delete rows
 * older than the window" range scan and any "events in the last N days"
 * query; the composite `(tool_name, created_at)` / `(theme, created_at)`
 * indexes support the group-by-then-filter-by-time queries a stats view
 * needs ("tool_name counts over the last 90 days") without a full scan.
 */
const addAnalyticsEvents: Migration = {
  id: "003_add_analytics_events",
  statements: [
    `CREATE TABLE IF NOT EXISTS analytics_tool_events (
      id bigserial PRIMARY KEY,
      surface text NOT NULL,
      tool_name text NOT NULL,
      outcome text NOT NULL,
      latency_bucket text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS analytics_tool_events_created_at_idx
      ON analytics_tool_events (created_at);`,
    `CREATE INDEX IF NOT EXISTS analytics_tool_events_tool_name_created_at_idx
      ON analytics_tool_events (tool_name, created_at);`,
    `CREATE INDEX IF NOT EXISTS analytics_tool_events_surface_outcome_idx
      ON analytics_tool_events (surface, outcome);`,
    `CREATE TABLE IF NOT EXISTS analytics_question_events (
      id bigserial PRIMARY KEY,
      theme text NOT NULL,
      latency_bucket text NOT NULL,
      used_retrieval boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS analytics_question_events_created_at_idx
      ON analytics_question_events (created_at);`,
    `CREATE INDEX IF NOT EXISTS analytics_question_events_theme_created_at_idx
      ON analytics_question_events (theme, created_at);`,
  ],
};

/** Every migration, in the order they must be applied. */
export const migrations: Migration[] = [initPgvectorChunks, addEmbeddingModel, addAnalyticsEvents];

/**
 * Pure diff: which of `all` are not yet represented in `appliedIds`, in
 * `all`'s original order. No I/O — the runner (`migrate.ts`) is the only
 * caller that touches the database, which is what makes this testable
 * without one.
 */
export function selectPendingMigrations(
  all: readonly Migration[],
  appliedIds: readonly string[],
): Migration[] {
  const applied = new Set(appliedIds);
  return all.filter((migration) => !applied.has(migration.id));
}
