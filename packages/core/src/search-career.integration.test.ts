import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChunkCitation } from "./chunking/types.js";
import { runMigrations } from "./db/migrate.js";
import type { NeonBranchConfig } from "./db/neon-branch.js";
import {
  createNeonTestBranch,
  deleteNeonTestBranch,
  loadNeonBranchConfig,
} from "./db/neon-branch.js";
import { resetCareerChunks } from "./db/reset-career-chunks.js";
import { EMBEDDING_DIMENSION } from "./embedding/config.js";
import {
  createSearchCareer,
  type SearchCareerEmbedder,
  StoredEmbeddingModelMismatchError,
} from "./search-career.js";

/**
 * Real-Neon integration suite for #34's acceptance criteria that need an
 * actual database round-trip: score-descending ranking against seeded data,
 * a fuzzy cross-cutting query, and an `EXPLAIN` check that the HNSW index is
 * actually used. Validation/caching/filter logic is covered network-free in
 * `search-career.test.ts` with a fake `sql` — this suite only adds what a
 * fake can't prove: real pgvector ANN behavior and query-planner choices.
 *
 * The local `GOOGLE_GENERATIVE_AI_API_KEY` is a known-invalid placeholder
 * (tracked separately) — so this suite never calls a real embedding
 * provider. It injects a fake, deterministic `embedder` whose output vectors
 * are chosen by this file to line up with specific seeded fixture
 * embeddings, standing in for "the model judged these semantically similar"
 * without a live model. Everything downstream of that embedding call
 * (SQL generation, ranking, filtering, index usage) is exercised for real.
 *
 * Skips cleanly when NEON_API_KEY/NEON_PROJECT_ID aren't set — see
 * README.md "Running the DB integration suite locally".
 */
const neonConfig: NeonBranchConfig | undefined = loadNeonBranchConfig();
const MODEL_ID = "gemini-embedding-001";
const NOISE_ROW_COUNT = 300;

type TestSql = ReturnType<typeof postgres>;

function embeddingWithSpike(spikeIndex: number, value = 1): number[] {
  const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
  embedding[spikeIndex] = value;
  return embedding;
}

/** A vector mostly aligned with `alignedIndex`, with a small amount of `orthogonalIndex` mixed in — graded, monotonic cosine similarity, matching rag-store.integration.test.ts's fixture strategy. */
function embeddingMix(
  alignedIndex: number,
  orthogonalIndex: number,
  alignedWeight: number,
): number[] {
  const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
  embedding[alignedIndex] = alignedWeight;
  embedding[orthogonalIndex] = 1 - alignedWeight;
  return embedding;
}

interface FixtureChunk {
  id: string;
  sourceType: string;
  sourceId: string;
  content: string;
  embedding: number[];
  embeddingModel?: string;
  /** 0-based index among chunks from the same source. Defaults to 0 — most fixtures are one chunk per source. */
  chunkIndex?: number;
}

function citationFor(chunk: FixtureChunk): ChunkCitation {
  return {
    entityType: chunk.sourceType as ChunkCitation["entityType"],
    entityId: chunk.sourceId,
    label: chunk.id,
  };
}

async function seedChunks(sql: TestSql, chunks: FixtureChunk[]): Promise<void> {
  const BATCH_SIZE = 20;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((chunk) => {
        const vectorLiteral = `[${chunk.embedding.join(",")}]`;
        return sql`
          INSERT INTO career_chunks (
            id, source_type, source_id, chunk_index, citation, content, content_hash, embedding, embedding_model
          ) VALUES (
            ${chunk.id}, ${chunk.sourceType}, ${chunk.sourceId}, ${chunk.chunkIndex ?? 0},
            ${JSON.stringify(citationFor(chunk))}::jsonb,
            ${chunk.content}, ${`hash-${chunk.id}`}, ${vectorLiteral}::vector,
            ${chunk.embeddingModel ?? MODEL_ID}
          )
          ON CONFLICT (id) DO UPDATE SET
            source_type = EXCLUDED.source_type,
            source_id = EXCLUDED.source_id,
            citation = EXCLUDED.citation,
            content = EXCLUDED.content,
            content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding,
            embedding_model = EXCLUDED.embedding_model
        `;
      }),
    );
  }
}

/** Deterministic pseudo-random unit-ish vector, so `NOISE_ROW_COUNT` fixtures don't collide with the meaningful fixtures below and give pgvector's HNSW index enough corpus size to be worth choosing over a sequential scan. */
function noiseEmbedding(seed: number): number[] {
  const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
  // Two pseudo-random spikes per row, far from the low-index dimensions the
  // meaningful fixtures below use, so noise rows never rank above them.
  const a = 400 + (seed % 300);
  const b = 400 + ((seed * 7) % 300);
  embedding[a] = 0.7;
  embedding[b] = 0.3;
  return embedding;
}

function embedderReturning(vectorsByQuery: Record<string, number[]>): SearchCareerEmbedder {
  return {
    async embed(texts: readonly string[]): Promise<number[][]> {
      return texts.map((text) => {
        const vector = vectorsByQuery[text];
        if (vector === undefined) {
          throw new Error(`test embedder: no fixture vector configured for query "${text}"`);
        }
        return vector;
      });
    },
  };
}

describe.runIf(neonConfig !== undefined)("searchCareer (real Neon branch)", () => {
  let branchId: string | undefined;
  let sql: TestSql | undefined;

  beforeAll(async () => {
    if (neonConfig === undefined) return;
    const branch = await createNeonTestBranch(neonConfig, "hire-me-mcp-core-search-it");
    branchId = branch.branchId;
    sql = postgres(branch.connectionUri, { max: 10, ssl: "require", connect_timeout: 30 });

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
    await runMigrations(sql);

    // Test branches fork from the project's default branch, which has real
    // rows in career_chunks since the first production reindex (#52) — so
    // a freshly created branch isn't actually empty. Reset it here so this
    // suite's exact-count/ordering assertions only see the fixtures seeded
    // below, regardless of what the parent branch looked like (#173).
    await resetCareerChunks(sql);

    // Bulk corpus: enough rows that the query planner has a real reason to
    // prefer the HNSW index over a sequential scan (see the EXPLAIN test).
    const noise: FixtureChunk[] = Array.from({ length: NOISE_ROW_COUNT }, (_, i) => ({
      id: `noise-${i}`,
      sourceType: "project",
      sourceId: `noise-${i}`,
      content: `Noise fixture ${i}.`,
      embedding: noiseEmbedding(i),
    }));

    // Fixtures for score-desc ordering + citations.
    const ranking: FixtureChunk[] = [
      {
        id: "rank-near",
        sourceType: "project",
        sourceId: "rank-near",
        content: "Very close match.",
        embedding: embeddingMix(5, 350, 0.99),
      },
      {
        id: "rank-mid",
        sourceType: "project",
        sourceId: "rank-mid",
        content: "Moderate match.",
        embedding: embeddingMix(5, 350, 0.5),
      },
      {
        id: "rank-far",
        sourceType: "project",
        sourceId: "rank-far",
        // A tiny (but nonzero) alignment with the query dimension — "far"
        // relative to near/mid, but still deterministically above the sea
        // of exact-zero-score noise/other-fixture rows below, so this
        // fixture's rank among `project`-type rows never depends on
        // Postgres's unspecified tie-break order for equal scores.
        content: "Almost entirely orthogonal, unrelated.",
        embedding: embeddingMix(5, 355, 0.01),
      },
    ];

    // Fixture for the fuzzy, cross-cutting query — content phrased with none
    // of the query's literal wording, only conceptually related.
    const archChunk: FixtureChunk = {
      id: "arch-experience",
      sourceType: "experience",
      sourceId: "acme-platform-team",
      content:
        "Led the migration from a monolith to a set of decoupled services communicating over an " +
        "async message bus, replacing synchronous point-to-point calls with pub/sub events.",
      embedding: embeddingWithSpike(10),
    };
    const archDecoy: FixtureChunk = {
      id: "arch-decoy",
      sourceType: "experience",
      sourceId: "unrelated-role",
      content: "Managed a customer support ticket queue and wrote onboarding documentation.",
      embedding: embeddingWithSpike(370),
    };

    // Fixture for the model-mismatch check.
    const staleModelChunk: FixtureChunk = {
      id: "stale-model-chunk",
      sourceType: "skill",
      sourceId: "stale-skill",
      content: "Embedded with an old model.",
      embedding: embeddingWithSpike(20),
      embeddingModel: "old-embedding-model-v0",
    };

    // Fixtures for the sourceTypes filter (real DB round trip).
    const filterA: FixtureChunk = {
      id: "filter-project",
      sourceType: "project",
      sourceId: "filter-project",
      content: "Project fixture for source-type filtering.",
      embedding: embeddingMix(30, 371, 0.95),
    };
    const filterB: FixtureChunk = {
      id: "filter-experience",
      sourceType: "experience",
      sourceId: "filter-experience",
      content: "Experience fixture for source-type filtering.",
      embedding: embeddingMix(30, 371, 0.9),
    };

    // Fixtures for the source-diverse topK contract (#292): one source
    // contributes three higher-scoring chunks, another contributes a single
    // lower-scoring (but still relevant) chunk. A naive chunk-level `LIMIT`
    // would let the first source alone fill `topK`, hiding the second.
    const multiChunkSource: FixtureChunk[] = [
      {
        id: "multi-source-chunk-0",
        sourceType: "gap",
        sourceId: "multi-chunk-source",
        chunkIndex: 0,
        content: "Multi-chunk source, chunk 0 (best match).",
        embedding: embeddingMix(50, 390, 0.99),
      },
      {
        id: "multi-source-chunk-1",
        sourceType: "gap",
        sourceId: "multi-chunk-source",
        chunkIndex: 1,
        content: "Multi-chunk source, chunk 1.",
        embedding: embeddingMix(50, 391, 0.97),
      },
      {
        id: "multi-source-chunk-2",
        sourceType: "gap",
        sourceId: "multi-chunk-source",
        chunkIndex: 2,
        content: "Multi-chunk source, chunk 2.",
        embedding: embeddingMix(50, 392, 0.95),
      },
    ];
    const singleChunkSource: FixtureChunk = {
      id: "single-source-chunk-0",
      sourceType: "gap",
      sourceId: "single-chunk-source",
      chunkIndex: 0,
      content: "Single-chunk source, lower-scoring but still relevant.",
      embedding: embeddingMix(50, 393, 0.5),
    };

    await seedChunks(sql, [
      ...noise,
      ...ranking,
      archChunk,
      archDecoy,
      staleModelChunk,
      filterA,
      filterB,
      ...multiChunkSource,
      singleChunkSource,
    ]);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    if (neonConfig !== undefined && branchId !== undefined) {
      await deleteNeonTestBranch(neonConfig, branchId);
    }
  }, 30_000);

  it("returns seeded results sorted by score descending, each with a non-empty citation", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const queryVector = embeddingWithSpike(5);
    const embedder = embedderReturning({ "ranking query": queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("ranking query", { topK: 3, sourceTypes: ["project"] });

    const rankIds = result.results
      .filter((r) => r.sourceId.startsWith("rank-"))
      .map((r) => r.sourceId);
    expect(rankIds).toEqual(["rank-near", "rank-mid", "rank-far"]);
    for (const item of result.results) {
      expect(item.citation).toBeTruthy();
      expect(item.citation.entityId).toBeTruthy();
      expect(typeof item.score).toBe("number");
    }
    const scores = result.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  }, 30_000);

  it("returns plain-JSON-serializable results against real seeded data", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const queryVector = embeddingWithSpike(5);
    const embedder = embedderReturning({ "json roundtrip query": queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("json roundtrip query", { topK: 3 });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  }, 30_000);

  it("sourceTypes filtering restricts results to the requested source type against real seeded data", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const queryVector = embeddingMix(30, 371, 1);
    const embedder = embedderReturning({ "filter query": queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("filter query", { topK: 2, sourceTypes: ["experience"] });

    const ids = result.results.map((r) => r.sourceId);
    expect(ids).toContain("filter-experience");
    expect(ids).not.toContain("filter-project");
  }, 30_000);

  it("topK counts unique sources against real seeded data: several higher-scoring chunks from one source cannot hide another qualifying source", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const queryVector = embeddingWithSpike(50);
    const embedder = embedderReturning({ "unique source topK query": queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("unique source topK query", {
      topK: 2,
      sourceTypes: ["gap"],
    });

    const sourceIds = result.results.map((r) => r.sourceId);
    expect(sourceIds).toEqual(["multi-chunk-source", "single-chunk-source"]);
    // The best chunk (chunk 0) is the one that surfaces as the discovery excerpt.
    const multi = result.results.find((r) => r.sourceId === "multi-chunk-source");
    expect(multi?.chunkIndex).toBe(0);
  }, 30_000);

  it("a fuzzy, cross-cutting query (no literal wording overlap) returns the conceptually related source in the top results", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const fuzzyQuery = "How comfortable are you with event-driven architecture?";
    // Aligned closely (not identically) with the arch-experience fixture's
    // embedding, standing in for "the model judged these related" — see
    // this file's docstring for why a fake embedder is used here.
    const queryVector = embeddingMix(10, 371, 0.9);
    const embedder = embedderReturning({ [fuzzyQuery]: queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer(fuzzyQuery, { topK: 5, sourceTypes: ["experience"] });

    expect(result.results[0]?.sourceId).toBe("acme-platform-team");
    const archScore = result.results.find((r) => r.sourceId === "acme-platform-team")?.score;
    const decoyScore = result.results.find((r) => r.sourceId === "unrelated-role")?.score;
    // The decoy is included (the fixture pool of `experience`-type rows is
    // small), but it must rank clearly below the conceptually related
    // fixture — proving the ranking, not just presence, reflects relevance.
    expect(archScore).toBeGreaterThan(decoyScore ?? Number.NEGATIVE_INFINITY);
  }, 30_000);

  it("throws StoredEmbeddingModelMismatchError when the top result was embedded with a stale model", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const queryVector = embeddingWithSpike(20);
    const embedder = embedderReturning({ "stale model query": queryVector });
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(
      searchCareer("stale model query", { topK: 1, sourceTypes: ["skill"] }),
    ).rejects.toBeInstanceOf(StoredEmbeddingModelMismatchError);
  }, 30_000);

  it("EXPLAIN shows the query plan uses the career_chunks HNSW index, not a sequential scan", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const vectorLiteral = `[${embeddingWithSpike(5).join(",")}]`;

    const plan = await sql.begin(async (tx) => {
      await tx`SET LOCAL enable_seqscan = off`;
      return tx<{ "QUERY PLAN": string }[]>`
        EXPLAIN
        SELECT source_type, source_id, chunk_index, citation, content, embedding_model,
               1 - (embedding <=> ${vectorLiteral}::vector) AS score
        FROM career_chunks
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${10}
      `;
    });

    const planText = plan.map((row) => row["QUERY PLAN"]).join("\n");
    expect(planText).toMatch(/Index Scan/i);
    expect(planText).toContain("career_chunks_embedding_hnsw_idx");
  }, 30_000);
});

if (neonConfig === undefined) {
  console.log(
    "Skipping searchCareer Neon integration suite: NEON_API_KEY and/or NEON_PROJECT_ID are not set. " +
      "See README.md 'Running the DB integration suite locally' to run it.",
  );
}
