import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChunkCitation } from "./chunks-repository.js";
import { getChunkById, upsertChunk } from "./chunks-repository.js";
import { runMigrations } from "./migrate.js";
import type { NeonBranchConfig } from "./neon-branch.js";
import { createNeonTestBranch, deleteNeonTestBranch, loadNeonBranchConfig } from "./neon-branch.js";

/**
 * Real-Neon integration suite for #14's acceptance criteria: creates a
 * throwaway branch off the project's Neon database, runs migrations
 * against it, exercises upsert idempotency and ANN ordering with seeded
 * fixture vectors, and deletes the branch on teardown — including on
 * failure, so a flaky assertion never leaks a branch.
 *
 * Skips cleanly (not silently, not a hard failure) when NEON_API_KEY /
 * NEON_PROJECT_ID aren't set — see README.md "Running the DB integration
 * suite locally".
 */
const neonConfig: NeonBranchConfig | undefined = loadNeonBranchConfig();

type TestSql = ReturnType<typeof postgres>;

describe.runIf(neonConfig !== undefined)("Neon pgvector store (real branch)", () => {
  let branchId: string | undefined;
  let sql: TestSql | undefined;

  beforeAll(async () => {
    if (neonConfig === undefined) return;
    const branch = await createNeonTestBranch(neonConfig, "hire-me-mcp-core-it");
    branchId = branch.branchId;
    sql = postgres(branch.connectionUri, { max: 1, ssl: "require", connect_timeout: 30 });

    // Neon computes cold-start on first connection — retry briefly instead
    // of failing on a transient "endpoint is not ready yet".
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await sql`SELECT 1`;
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    if (neonConfig !== undefined && branchId !== undefined) {
      await deleteNeonTestBranch(neonConfig, branchId);
    }
  }, 30_000);

  it("runs the initial migration against an empty database: extension, table, HNSW index", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const result = await runMigrations(sql);
    expect(result.appliedMigrationIds).toEqual(["001_init_pgvector_chunks"]);

    const [extension] = await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(extension).toBeDefined();

    const [table] = await sql`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'career_chunks'
    `;
    expect(table).toBeDefined();

    const [index] = await sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'career_chunks' AND indexname = 'career_chunks_embedding_hnsw_idx'
    `;
    expect(index).toBeDefined();
    expect((index as { indexdef: string }).indexdef).toMatch(/USING hnsw/);
    expect((index as { indexdef: string }).indexdef).toMatch(/vector_cosine_ops/);
  }, 30_000);

  it("running the migration a second time is a no-op (idempotent)", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const result = await runMigrations(sql);
    expect(result.appliedMigrationIds).toEqual([]);
  });

  function embeddingWithSpike(dimension: number, spikeIndex: number, value = 1): number[] {
    const embedding = new Array(dimension).fill(0);
    embedding[spikeIndex] = value;
    return embedding;
  }

  /**
   * A vector that's a weighted mix of the unit vectors at `alignedIndex`
   * and `orthogonalIndex` — `alignedWeight` close to 1 makes it nearly
   * identical (by cosine similarity) to the pure `alignedIndex` unit
   * vector; close to 0 makes it nearly identical to the orthogonal one.
   * Unlike two single-dimension "spikes" (which are always exactly
   * orthogonal to each other regardless of how close their indices are),
   * this produces genuinely graded, monotonic similarity for the ANN
   * ordering fixture below.
   */
  function embeddingMix(
    dimension: number,
    alignedIndex: number,
    orthogonalIndex: number,
    alignedWeight: number,
  ) {
    const embedding = new Array(dimension).fill(0);
    embedding[alignedIndex] = alignedWeight;
    embedding[orthogonalIndex] = 1 - alignedWeight;
    return embedding;
  }

  it("round-trips a chunk (insert -> select) with citation fields intact", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    await upsertChunk(sql, {
      id: "chunk-roundtrip-1",
      sourceType: "project",
      sourceId: "proj-1",
      chunkIndex: 0,
      citation: {
        entityType: "project",
        entityId: "proj-1",
        label: "Project One",
        fragment: "chunk-0",
        url: "https://example.com/proj-1",
      } satisfies ChunkCitation,
      content: "Built a thing.",
      contentHash: "hash-1",
      tokenCount: 4,
      embedding: embeddingWithSpike(768, 0),
    });

    const record = await getChunkById(sql, "chunk-roundtrip-1");
    expect(record).toBeDefined();
    expect(record?.content).toBe("Built a thing.");
    expect(record?.contentHash).toBe("hash-1");
    expect(record?.citation).toEqual({
      entityType: "project",
      entityId: "proj-1",
      label: "Project One",
      fragment: "chunk-0",
      url: "https://example.com/proj-1",
    });
    expect(record?.embedding).toHaveLength(768);
    expect(record?.embedding[0]).toBeCloseTo(1, 5);
  });

  it("upserting a chunk with an existing id updates it in place, not a duplicate row", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const chunkId = "chunk-upsert-1";
    const baseChunk = {
      id: chunkId,
      sourceType: "project",
      sourceId: "proj-2",
      chunkIndex: 0,
      citation: {
        entityType: "project",
        entityId: "proj-2",
        label: "Project Two",
      } satisfies ChunkCitation,
      content: "Original content.",
      contentHash: "hash-original",
      embedding: embeddingWithSpike(768, 1),
    };

    await upsertChunk(sql, baseChunk);
    await upsertChunk(sql, {
      ...baseChunk,
      content: "Updated content.",
      contentHash: "hash-updated",
    });

    const countRows = await sql<{ count: string }[]>`
      SELECT count(*)::int AS count FROM career_chunks WHERE id = ${chunkId}
    `;
    expect(Number(countRows[0]?.count)).toBe(1);

    const record = await getChunkById(sql, chunkId);
    expect(record?.content).toBe("Updated content.");
    expect(record?.contentHash).toBe("hash-updated");
  });

  it("ANN query returns seeded fixture vectors ordered by similarity", async () => {
    if (sql === undefined) throw new Error("sql not initialized");

    // Three chunks with graded cosine similarity to the query vector (unit
    // vector at dimension 5): "near" is almost identical, "mid" is a 50/50
    // mix with an orthogonal dimension, "far" is fully orthogonal.
    const fixtures = [
      { id: "ann-near", embedding: embeddingMix(768, 5, 300, 0.99) },
      { id: "ann-mid", embedding: embeddingMix(768, 5, 300, 0.5) },
      { id: "ann-far", embedding: embeddingWithSpike(768, 300) },
    ];
    for (const fixture of fixtures) {
      await upsertChunk(sql, {
        id: fixture.id,
        sourceType: "project",
        sourceId: fixture.id,
        chunkIndex: 0,
        citation: {
          entityType: "project",
          entityId: fixture.id,
          label: fixture.id,
        } satisfies ChunkCitation,
        content: `fixture ${fixture.id}`,
        contentHash: `hash-${fixture.id}`,
        embedding: fixture.embedding,
      });
    }

    const queryEmbedding = embeddingWithSpike(768, 5);
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const rows = await sql<{ id: string; score: number }[]>`
      SELECT id, 1 - (embedding <=> ${vectorLiteral}::vector) AS score
      FROM career_chunks
      WHERE id = ANY(${["ann-near", "ann-mid", "ann-far"]})
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT 3
    `;

    expect(rows.map((r) => r.id)).toEqual(["ann-near", "ann-mid", "ann-far"]);
    expect(rows[0]?.score).toBeGreaterThan(rows[1]?.score ?? Number.POSITIVE_INFINITY);
    expect(rows[1]?.score).toBeGreaterThan(rows[2]?.score ?? Number.POSITIVE_INFINITY);
  });
});

if (neonConfig === undefined) {
  console.log(
    "Skipping Neon pgvector integration suite: NEON_API_KEY and/or NEON_PROJECT_ID are not set. " +
      "See README.md 'Running the DB integration suite locally' to run it.",
  );
}
