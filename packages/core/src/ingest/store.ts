/**
 * Storage seam for the ingestion pipeline (#24) — an {@link IngestStore}
 * is the only thing `run.ts` writes through, so the orchestration logic is
 * unit-testable against an in-memory fake (see `run.test.ts`) with no
 * database, and the real implementation here (`createDbIngestStore`) is a
 * thin adapter over `chunks-repository.ts`.
 */

import type { Sql } from "postgres";
import type { ChunkFingerprint } from "../db/chunks-repository.js";
import { deleteChunksByIds, listChunkFingerprints, upsertChunk } from "../db/chunks-repository.js";
import type { EmbeddedChunk } from "./types.js";

export interface IngestStore {
  /** Cheap id/contentHash/embeddingModel scan of every stored chunk — the diff's read side. */
  listFingerprints(): Promise<ChunkFingerprint[]>;
  /** Upserts every embedded chunk. Called only for chunks the diff classified as insert/update. */
  upsertMany(chunks: readonly EmbeddedChunk[]): Promise<void>;
  /** Deletes chunks by id — orphan cleanup for source records that disappeared. No-op for an empty array. */
  deleteMany(ids: readonly string[]): Promise<void>;
}

/**
 * Builds an {@link IngestStore} backed by the real Neon Postgres + pgvector
 * table. `upsertMany`/`deleteMany` each run inside a single transaction
 * (`sql.begin`) so a mid-batch failure never leaves a partial write — not
 * that a failure is expected here, since `run.ts` only calls this store
 * after every needed embedding has already succeeded.
 */
export function createDbIngestStore(sql: Sql): IngestStore {
  return {
    listFingerprints: () => listChunkFingerprints(sql),
    async upsertMany(chunks) {
      if (chunks.length === 0) return;
      await sql.begin(async (tx) => {
        // `chunks-repository.ts`'s helpers are typed against `Sql`, but
        // `sql.begin`'s callback hands back a `TransactionSql` (a
        // structurally-compatible tagged-template client missing a few
        // pool-only members like `.end`/`.CLOSE` these helpers never use)
        // — safe to widen back to `Sql` for this call.
        const txSql = tx as unknown as Sql;
        for (const chunk of chunks) {
          await upsertChunk(txSql, {
            id: chunk.id,
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId,
            chunkIndex: chunk.chunkIndex,
            citation: chunk.citation,
            content: chunk.text,
            contentHash: chunk.contentHash,
            tokenCount: chunk.tokenCount,
            embedding: chunk.embedding,
            embeddingModel: chunk.embeddingModel,
          });
        }
      });
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      await sql.begin(async (tx) => {
        await deleteChunksByIds(tx as unknown as Sql, ids as string[]);
      });
    },
  };
}
