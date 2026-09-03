/**
 * `searchCareer(query, options)` (#34, epic #6) — the single semantic
 * retrieval entry point for the whole project. Embeds `query` with the same
 * model used at ingestion (#24), runs an ANN cosine-similarity search
 * against the Neon + pgvector store (#14), and returns ranked chunks with
 * scores and citations as plain, JSON-serializable data — no class
 * instances, no DB row leakage. The MCP tool (`search_career`, epic #3) and
 * the chat agent (epic #5) are both thin adapters over this function.
 *
 * `searchCareer` never answers questions or synthesizes prose — it returns
 * evidence. Any hedging/refusal behavior is the agent layer's job, not
 * this one's (see the epic #6 "hybrid behavior" locked decision).
 *
 * Exported as its own subpath, `@hire-me-mcp/core/search-career` — mirroring
 * `./db` and `./embedding` — since it necessarily pulls in the `postgres`
 * driver (a live ANN query, not just types), so consumers that don't search
 * anything don't pull that dependency in just by importing
 * `@hire-me-mcp/core`.
 *
 * ## Score semantics
 *
 * `score` is cosine similarity, `1 - cosine_distance`, computed by pgvector's
 * `<=>` operator against the `career_chunks.embedding` column's
 * `vector_cosine_ops` HNSW index (see `db/migrations.ts`'s ADR and
 * `db/chunks-repository.ts`'s `findSimilarChunks`, which this module mirrors
 * for its own filtered query). For unit-magnitude embedding vectors this
 * lands in `[-1, 1]`, 1 meaning identical direction; embedding providers
 * (including `gemini-embedding-001`) return effectively unit-normalized
 * vectors, so scores in practice cluster in a narrower positive band. Higher
 * is always more similar. Results are always sorted by `score` descending.
 */

import type { Sql } from "postgres";
import type { ChunkCitation } from "./chunking/types.js";
import { EMBEDDING_DIMENSION, parseCitation, toVectorLiteral } from "./db/chunks-repository.js";
import { STORED_EMBEDDING_MODEL_ID } from "./embedding/config.js";

/** Default number of results when `topK` is omitted — enough for a useful evidence set without over-fetching. */
export const DEFAULT_TOP_K = 10;
/** Smallest allowed `topK`. */
export const MIN_TOP_K = 1;
/** Largest allowed `topK` — bounds a single query's cost against the store. */
export const MAX_TOP_K = 50;
/**
 * Default minimum score — `0` (no filtering by default): cosine similarity
 * of `0` means "orthogonal, no discernible relationship", so anything at or
 * above it is left in by default and it's up to the caller to raise the bar
 * for a stricter cut.
 */
export const DEFAULT_MIN_SCORE = 0;
/** Longest accepted query, in characters — guards against pathological input reaching the embedding API. */
export const MAX_QUERY_LENGTH = 2000;
/**
 * The calibrated relevance floor: cosine-similarity scores below this value
 * are, empirically, indistinguishable from off-topic noise against this
 * corpus. The number comes from the retrieval eval suite's absent-topic
 * calibration (`eval-retrieval/cli.ts`, #41): with task-type-aware
 * embeddings, genuinely-absent-topic queries' top scores cluster below
 * ~0.641 while real matches bottom out around 0.647 — `0.644` sits in the
 * gap. `searchCareer` itself does NOT apply this floor (the eval suite
 * needs raw, unfiltered rankings to measure against); consumer-facing
 * adapters (the MCP `search-career` tool) apply it so an off-topic query
 * produces an honest "no relevant content found" instead of
 * confident-looking noise (#237). Recalibrate alongside
 * `eval-retrieval/cli.ts`'s `absentTopicMinScore` — the two must move
 * together.
 */
export const RELEVANCE_FLOOR = 0.644;

/** Thrown for an empty/whitespace-only or oversized query — never reaches the embedder. */
export class InvalidSearchCareerQueryError extends Error {
  constructor(reason: string) {
    super(`Invalid searchCareer query: ${reason}`);
    this.name = "InvalidSearchCareerQueryError";
  }
}

/** Thrown when `topK` is missing bounds/integer requirements — never reaches the embedder. */
export class InvalidTopKError extends Error {
  constructor(topK: unknown) {
    super(
      `Invalid searchCareer topK: ${String(topK)}. Must be an integer between ${MIN_TOP_K} and ${MAX_TOP_K}.`,
    );
    this.name = "InvalidTopKError";
  }
}

/**
 * Thrown when a result came from a chunk stored with a different
 * `embedding_model` than the one the query itself was just embedded with.
 * Comparing vectors from two different embedding models produces
 * meaningless cosine-similarity scores, so this surfaces as a clear typed
 * error rather than silently returning garbage-ranked results — the
 * ingestion pipeline (#24) is expected to re-embed the store on a model
 * change before `searchCareer` is used against it again.
 */
export class StoredEmbeddingModelMismatchError extends Error {
  readonly configuredModel: string;
  readonly storedModels: readonly string[];

  constructor(configuredModel: string, storedModels: readonly string[]) {
    super(
      `searchCareer is configured to query with embedding model "${configuredModel}", but the store ` +
        `returned chunk(s) embedded with a different model: ${storedModels.join(", ")}. ` +
        "Re-run ingestion to re-embed the store before searching against it.",
    );
    this.name = "StoredEmbeddingModelMismatchError";
    this.configuredModel = configuredModel;
    this.storedModels = storedModels;
  }
}

export interface SearchCareerOptions {
  /** Max results to return. Defaults to {@link DEFAULT_TOP_K}. Must be an integer in `[MIN_TOP_K, MAX_TOP_K]`. */
  topK?: number;
  /** Minimum cosine-similarity score (see this module's doc comment) a result must meet. Defaults to {@link DEFAULT_MIN_SCORE}. */
  minScore?: number;
  /** Restrict results to these `sourceType`s (e.g. `["project", "experience"]`). Omitted/empty imposes no constraint. */
  sourceTypes?: readonly string[];
}

/** One ranked, plain-JSON-serializable retrieval result. */
export interface SearchCareerResultItem {
  text: string;
  /** Cosine similarity, `1 - distance` — see this module's doc comment. Higher is more similar. */
  score: number;
  citation: ChunkCitation;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
}

/** Plain-JSON-serializable `searchCareer` result — safe to pass straight through an MCP tool response or `JSON.stringify`. */
export interface SearchCareerResult {
  query: string;
  results: SearchCareerResultItem[];
  /** Wall-clock time spent in this call, in milliseconds — diagnostic only. */
  tookMs: number;
}

/** Low-level embedder interface `searchCareer` needs — matches `EmbeddingClient` from `@hire-me-mcp/core/embedding` without importing that subpath's provider dependencies. */
export interface SearchCareerEmbedder {
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface CreateSearchCareerOptions {
  /** Live Postgres client (`@hire-me-mcp/core/db`'s `createDbClient(...).sql`). */
  sql: Sql;
  /** Query embedder — reuse `createEmbeddingClient`/`createGoogleEmbeddingClient` from `@hire-me-mcp/core/embedding` in production; tests inject a fake. */
  embedder: SearchCareerEmbedder;
  /** The configured embedding model id, compared against each result's stored `embedding_model`. Defaults to `STORED_EMBEDDING_MODEL_ID`. */
  modelId?: string;
  /** Injectable clock for deterministic `tookMs` in tests. Defaults to `Date.now`. */
  now?: () => number;
}

export type SearchCareer = (
  query: string,
  options?: SearchCareerOptions,
) => Promise<SearchCareerResult>;

interface SearchCareerRow {
  source_type: string;
  source_id: string;
  chunk_index: number;
  citation: string | ChunkCitation;
  content: string;
  embedding_model: string;
  score: number;
}

function validateQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new InvalidSearchCareerQueryError("query is empty or whitespace-only");
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new InvalidSearchCareerQueryError(
      `query is ${trimmed.length} characters, exceeding the ${MAX_QUERY_LENGTH}-character limit`,
    );
  }
  return trimmed;
}

function validateTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK < MIN_TOP_K || topK > MAX_TOP_K) {
    throw new InvalidTopKError(topK);
  }
}

/**
 * Fetches every chunk matching `sourceTypes` (or every chunk in the store,
 * when omitted), ranked by ANN cosine distance — deliberately with no
 * `LIMIT`. `topK` (#292) counts unique source records, not raw chunks: a
 * single source can contribute several chunks, so cutting the candidate set
 * at the raw-chunk level here, before {@link selectTopKUniqueSources} groups
 * by source, could hide another qualifying source entirely. The corpus this
 * queries against is a single person's portfolio content — small enough
 * that fetching it in full per query is cheap; `sourceTypes` still narrows
 * the scan when the caller only cares about part of it.
 */
async function runAnnQuery(
  sql: Sql,
  vectorLiteral: string,
  sourceTypes: readonly string[] | undefined,
): Promise<SearchCareerRow[]> {
  if (sourceTypes !== undefined && sourceTypes.length > 0) {
    return sql<SearchCareerRow[]>`
      SELECT source_type, source_id, chunk_index, citation, content, embedding_model,
             1 - (embedding <=> ${vectorLiteral}::vector) AS score
      FROM career_chunks
      WHERE source_type = ANY(${sourceTypes as string[]})
      ORDER BY embedding <=> ${vectorLiteral}::vector
    `;
  }
  return sql<SearchCareerRow[]>`
    SELECT source_type, source_id, chunk_index, citation, content, embedding_model,
           1 - (embedding <=> ${vectorLiteral}::vector) AS score
    FROM career_chunks
    ORDER BY embedding <=> ${vectorLiteral}::vector
  `;
}

/**
 * Deterministic ordering for {@link selectTopKUniqueSources}: highest score
 * first; ties broken by `sourceType` then `sourceId` ascending (stable
 * regardless of row arrival order, and safe even if two different source
 * types ever shared a raw `sourceId`), then by `chunkIndex` ascending (used
 * when picking the best chunk *within* one source).
 */
function compareRanked(a: SearchCareerResultItem, b: SearchCareerResultItem): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (a.sourceType !== b.sourceType) {
    return a.sourceType < b.sourceType ? -1 : 1;
  }
  if (a.sourceId !== b.sourceId) {
    return a.sourceId < b.sourceId ? -1 : 1;
  }
  return a.chunkIndex - b.chunkIndex;
}

/**
 * Groups ranked chunk rows by `(sourceType, sourceId)`, keeping only the
 * highest-scoring chunk per source (its text and citation become that
 * source's discovery excerpt), applies `minScore` to each source's best
 * chunk, orders the resulting unique sources by score (deterministic ties —
 * see {@link compareRanked}), and only then slices to `topK`. Exported as a
 * pure function so the grouping contract itself — independent of the
 * database and embedder — is directly unit-testable (#292).
 */
export function selectTopKUniqueSources(
  rows: readonly SearchCareerResultItem[],
  topK: number,
  minScore: number,
): SearchCareerResultItem[] {
  const bestBySource = new Map<string, SearchCareerResultItem>();
  for (const row of rows) {
    const key = `${row.sourceType}:${row.sourceId}`;
    const existing = bestBySource.get(key);
    if (
      existing === undefined ||
      row.score > existing.score ||
      (row.score === existing.score && row.chunkIndex < existing.chunkIndex)
    ) {
      bestBySource.set(key, row);
    }
  }

  return [...bestBySource.values()]
    .filter((row) => row.score >= minScore)
    .sort(compareRanked)
    .slice(0, topK);
}

/**
 * Builds a `searchCareer` function bound to a live `sql` client and query
 * embedder. Keeps a small in-process `Map` cache keyed by the trimmed query
 * string, so repeated identical queries within one process (e.g. an eval run
 * or a chat session revisiting the same question) never re-embed — cleared
 * only by process exit, matching "one run" from the acceptance criteria.
 */
export function createSearchCareer(options: CreateSearchCareerOptions): SearchCareer {
  const { sql, embedder } = options;
  const modelId = options.modelId ?? STORED_EMBEDDING_MODEL_ID;
  const now = options.now ?? Date.now;
  const embeddingCache = new Map<string, number[]>();

  return async function searchCareer(
    query: string,
    searchOptions: SearchCareerOptions = {},
  ): Promise<SearchCareerResult> {
    const startedAt = now();
    const trimmedQuery = validateQuery(query);

    const topK = searchOptions.topK ?? DEFAULT_TOP_K;
    validateTopK(topK);
    const minScore = searchOptions.minScore ?? DEFAULT_MIN_SCORE;
    const sourceTypes = searchOptions.sourceTypes;

    let queryEmbedding = embeddingCache.get(trimmedQuery);
    if (queryEmbedding === undefined) {
      const [embedded] = await embedder.embed([trimmedQuery]);
      if (embedded === undefined || embedded.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Query embedder returned an unexpected result for "${trimmedQuery}" ` +
            `(expected a ${EMBEDDING_DIMENSION}-dimension vector).`,
        );
      }
      queryEmbedding = embedded;
      embeddingCache.set(trimmedQuery, queryEmbedding);
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const rows = await runAnnQuery(sql, vectorLiteral, sourceTypes);

    const mismatchedModels = [
      ...new Set(
        rows.filter((row) => row.embedding_model !== modelId).map((row) => row.embedding_model),
      ),
    ];
    if (mismatchedModels.length > 0) {
      throw new StoredEmbeddingModelMismatchError(modelId, mismatchedModels);
    }

    const mapped = rows.map(
      (row): SearchCareerResultItem => ({
        text: row.content,
        score: Number(row.score),
        citation: parseCitation(row.citation),
        sourceType: row.source_type,
        sourceId: row.source_id,
        chunkIndex: row.chunk_index,
      }),
    );
    const results = selectTopKUniqueSources(mapped, topK, minScore);

    return { query, results, tookMs: now() - startedAt };
  };
}
