/**
 * Typed repository over the `career_chunks` table (#14) — upsert, point
 * lookup and ANN similarity search. This is the seam the future ingestion
 * pipeline (#24) and `searchCareer` (#34) both read/write through, so
 * neither has to know the pgvector literal format or the upsert SQL.
 *
 * See `migrations.ts` for the ADR on embedding dimension (768) and distance
 * metric (cosine, `vector_cosine_ops`) — this module's `<=>` operator usage
 * and `1 - distance` normalization must stay consistent with that choice.
 */

import type { Sql } from "postgres";

/** Embedding dimension enforced by the `career_chunks.embedding` column — see migrations.ts. */
export const EMBEDDING_DIMENSION = 768;

/** Thrown when an embedding's length doesn't match {@link EMBEDDING_DIMENSION}. */
export class InvalidEmbeddingDimensionError extends Error {
  constructor(actualDimension: number) {
    super(
      `Expected an embedding with ${EMBEDDING_DIMENSION} dimensions, got ${actualDimension}. ` +
        "This usually means the embedding model/truncation changed without updating the schema.",
    );
    this.name = "InvalidEmbeddingDimensionError";
  }
}

/** Renders a numeric embedding as a pgvector input literal, e.g. `[0.1,0.2,...]`. */
export function toVectorLiteral(embedding: readonly number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new InvalidEmbeddingDimensionError(embedding.length);
  }
  return `[${embedding.join(",")}]`;
}

/** Citation metadata stored alongside a chunk (see #34's `Citation` shape). */
export interface ChunkCitation {
  sourceType: string;
  sourceId: string;
  label: string;
  anchor?: string;
}

export interface CareerChunkInput {
  /** Stable id, unique across the whole table — the upsert key. */
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  citation: ChunkCitation;
  content: string;
  contentHash: string;
  tokenCount?: number;
  embedding: readonly number[];
}

export interface CareerChunkRecord extends Omit<CareerChunkInput, "embedding"> {
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SimilarChunkMatch extends CareerChunkRecord {
  /** `1 - cosine_distance`, so higher is more similar. See migrations.ts ADR. */
  score: number;
}

interface CareerChunkRow {
  id: string;
  source_type: string;
  source_id: string;
  chunk_index: number;
  citation: string | ChunkCitation;
  content: string;
  content_hash: string;
  token_count: number | null;
  embedding: string | number[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Normalizes a `citation` column value into a {@link ChunkCitation} object.
 * The `postgres` driver's jsonb parsing is connection/type-cache dependent
 * (observed returning the raw JSON string against a real Neon branch), so
 * this accepts either shape rather than assuming the driver always parses it.
 */
export function parseCitation(raw: string | ChunkCitation): ChunkCitation {
  return typeof raw === "string" ? (JSON.parse(raw) as ChunkCitation) : raw;
}

function parseEmbedding(raw: string | number[]): number[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  // pgvector returns text like "[0.1,0.2,...]" over the wire unless cast.
  return raw
    .slice(1, -1)
    .split(",")
    .map((value) => Number(value));
}

function mapRow(row: CareerChunkRow): CareerChunkRecord {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    citation: parseCitation(row.citation),
    content: row.content,
    contentHash: row.content_hash,
    tokenCount: row.token_count ?? undefined,
    embedding: parseEmbedding(row.embedding),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts a chunk, or updates it in place when `id` already exists
 * (`ON CONFLICT (id) DO UPDATE`) — the idempotent upsert the ingestion
 * pipeline (#24) needs to re-index changed content without duplicating rows.
 */
export async function upsertChunk(sql: Sql, chunk: CareerChunkInput): Promise<void> {
  const vectorLiteral = toVectorLiteral(chunk.embedding);
  await sql`
    INSERT INTO career_chunks (
      id, source_type, source_id, chunk_index, citation, content, content_hash, token_count, embedding
    ) VALUES (
      ${chunk.id},
      ${chunk.sourceType},
      ${chunk.sourceId},
      ${chunk.chunkIndex},
      ${JSON.stringify(chunk.citation)}::jsonb,
      ${chunk.content},
      ${chunk.contentHash},
      ${chunk.tokenCount ?? null},
      ${vectorLiteral}::vector
    )
    ON CONFLICT (id) DO UPDATE SET
      source_type = EXCLUDED.source_type,
      source_id = EXCLUDED.source_id,
      chunk_index = EXCLUDED.chunk_index,
      citation = EXCLUDED.citation,
      content = EXCLUDED.content,
      content_hash = EXCLUDED.content_hash,
      token_count = EXCLUDED.token_count,
      embedding = EXCLUDED.embedding,
      updated_at = now()
  `;
}

/** Point lookup by stable id — `undefined` when no chunk has that id. */
export async function getChunkById(sql: Sql, id: string): Promise<CareerChunkRecord | undefined> {
  const rows = await sql<CareerChunkRow[]>`
    SELECT id, source_type, source_id, chunk_index, citation, content, content_hash,
           token_count, embedding::text AS embedding, created_at, updated_at
    FROM career_chunks
    WHERE id = ${id}
  `;
  const row = rows[0];
  return row === undefined ? undefined : mapRow(row);
}

export interface FindSimilarChunksOptions {
  /** Max results to return. Defaults to 10. */
  topK?: number;
}

/**
 * ANN similarity search using pgvector's cosine distance operator (`<=>`),
 * matching the `vector_cosine_ops` HNSW index from `migrations.ts` so the
 * query actually uses that index. Returns results ordered by similarity
 * descending (nearest first).
 */
export async function findSimilarChunks(
  sql: Sql,
  queryEmbedding: readonly number[],
  options: FindSimilarChunksOptions = {},
): Promise<SimilarChunkMatch[]> {
  const topK = options.topK ?? 10;
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const rows = await sql<(CareerChunkRow & { score: number })[]>`
    SELECT id, source_type, source_id, chunk_index, citation, content, content_hash,
           token_count, embedding::text AS embedding, created_at, updated_at,
           1 - (embedding <=> ${vectorLiteral}::vector) AS score
    FROM career_chunks
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;
  return rows.map((row) => ({ ...mapRow(row), score: Number(row.score) }));
}
