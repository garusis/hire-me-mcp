import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import {
  createSearchCareer,
  DEFAULT_MIN_SCORE,
  DEFAULT_TOP_K,
  InvalidSearchCareerQueryError,
  InvalidTopKError,
  MAX_QUERY_LENGTH,
  MAX_TOP_K,
  MIN_TOP_K,
  RELEVANCE_FLOOR,
  StoredEmbeddingModelMismatchError,
} from "./search-career.js";

const MODEL_ID = "gemini-embedding-001";

interface FakeRow {
  id: string;
  source_type: string;
  source_id: string;
  chunk_index: number;
  citation: unknown;
  content: string;
  score: number;
  embedding_model: string;
}

/**
 * A minimal fake of the subset of postgres.js's `Sql` `searchCareer` calls:
 * a single tagged-template `SELECT ... ORDER BY ...`, with an optional
 * `source_type = ANY(...)` clause when `sourceTypes` is given. No `LIMIT`
 * clause: `searchCareer` fetches every matching chunk and applies `topK`
 * itself, after grouping by unique source (#292) — a chunk-level SQL
 * `LIMIT` before that grouping could hide a qualifying source. Real ANN
 * ordering/index usage is covered by search-career.integration.test.ts
 * against a real Neon branch — this fake only needs to stand in for "the DB
 * already did the ANN ranking", so unit tests can exercise searchCareer's
 * own validation/caching/filtering/grouping/error logic without a database
 * or network call, matching the migrate.test.ts fake-sql pattern.
 */
function createFakeSql(rows: FakeRow[]) {
  const calls: { text: string; values: unknown[] }[] = [];

  function fakeTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<FakeRow[]> {
    const text = strings.join("?");
    calls.push({ text, values });
    if (!text.includes("FROM career_chunks")) {
      throw new Error(`fake sql: unexpected tagged query: ${text}`);
    }
    if (text.includes("LIMIT")) {
      throw new Error(
        "fake sql: unexpected chunk-level LIMIT — topK must be applied after source grouping (#292)",
      );
    }
    let candidates = rows;
    if (text.includes("source_type = ANY")) {
      const sourceTypes = values.find((value) => Array.isArray(value)) as string[] | undefined;
      candidates = candidates.filter(
        (row) => sourceTypes === undefined || sourceTypes.includes(row.source_type),
      );
    }
    return Promise.resolve(candidates);
  }

  return { sql: fakeTag as unknown as Sql, calls };
}

function fakeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "chunk-1",
    source_type: "project",
    source_id: "proj-1",
    chunk_index: 0,
    citation: { entityType: "project", entityId: "proj-1", label: "Project One" },
    content: "Built a thing.",
    score: 0.9,
    embedding_model: MODEL_ID,
    ...overrides,
  };
}

function fakeEmbedder(vector: number[] = new Array(768).fill(0.1)) {
  const embedCalls: (readonly string[])[] = [];
  return {
    embedCalls,
    async embed(texts: readonly string[]): Promise<number[][]> {
      embedCalls.push(texts);
      return texts.map(() => vector);
    },
  };
}

describe("createSearchCareer", () => {
  it("returns plain-JSON-serializable results (round-trip via JSON.parse/JSON.stringify)", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("architecture experience");

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns results sorted by score descending, each with a non-empty citation and numeric score", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", score: 0.5 }),
      fakeRow({ id: "b", source_id: "proj-b", score: 0.9 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query");

    expect(result.results.map((r) => r.score)).toEqual([0.9, 0.5]);
    for (const item of result.results) {
      expect(typeof item.score).toBe("number");
      expect(item.citation).toBeTruthy();
      expect(Object.keys(item.citation).length).toBeGreaterThan(0);
    }
  });

  it("embeds the query with the same configured model id used at ingestion", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await searchCareer("query");

    expect(embedder.embedCalls).toHaveLength(1);
  });

  it("throws StoredEmbeddingModelMismatchError when a returned chunk's embedding_model differs from the configured model", async () => {
    const { sql } = createFakeSql([fakeRow({ embedding_model: "old-model" })]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("query")).rejects.toBeInstanceOf(StoredEmbeddingModelMismatchError);
  });

  it("topK limits the number of unique sources returned", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", score: 0.9 }),
      fakeRow({ id: "b", source_id: "proj-b", score: 0.8 }),
      fakeRow({ id: "c", source_id: "proj-c", score: 0.7 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { topK: 2 });

    expect(result.results).toHaveLength(2);
  });

  it("minScore excludes results scoring below the threshold", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", score: 0.9 }),
      fakeRow({ id: "b", source_id: "proj-b", score: 0.2 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { minScore: 0.5 });

    expect(result.results.map((r) => r.sourceId)).not.toContain("proj-b");
    expect(result.results).toHaveLength(1);
  });

  it("sourceTypes restricts results to the given source types", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_type: "project", score: 0.9 }),
      fakeRow({ id: "b", source_type: "experience", score: 0.8 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { sourceTypes: ["experience"] });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.sourceType).toBe("experience");
  });

  it("rejects an empty query with a typed validation error and makes no embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("")).rejects.toBeInstanceOf(InvalidSearchCareerQueryError);
    expect(embedder.embedCalls).toHaveLength(0);
  });

  it("rejects a whitespace-only query with a typed validation error and makes no embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("   \n\t  ")).rejects.toBeInstanceOf(InvalidSearchCareerQueryError);
    expect(embedder.embedCalls).toHaveLength(0);
  });

  it("rejects a query longer than MAX_QUERY_LENGTH with a typed validation error and makes no embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("a".repeat(MAX_QUERY_LENGTH + 1))).rejects.toBeInstanceOf(
      InvalidSearchCareerQueryError,
    );
    expect(embedder.embedCalls).toHaveLength(0);
  });

  it("rejects an out-of-range topK with a typed validation error and makes no embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("query", { topK: 0 })).rejects.toBeInstanceOf(InvalidTopKError);
    await expect(searchCareer("query", { topK: MAX_TOP_K + 1 })).rejects.toBeInstanceOf(
      InvalidTopKError,
    );
    await expect(searchCareer("query", { topK: 1.5 })).rejects.toBeInstanceOf(InvalidTopKError);
    expect(embedder.embedCalls).toHaveLength(0);
  });

  it("rejects a negative or non-finite topK with a typed validation error", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await expect(searchCareer("query", { topK: -1 })).rejects.toBeInstanceOf(InvalidTopKError);
    await expect(searchCareer("query", { topK: Number.NaN })).rejects.toBeInstanceOf(
      InvalidTopKError,
    );
  });

  it("querying an empty store returns an empty result array and does not throw", async () => {
    const { sql } = createFakeSql([]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query");

    expect(result.results).toEqual([]);
  });

  it("caches the query embedding: an identical repeated query makes only one embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await searchCareer("repeated query");
    await searchCareer("repeated query");

    expect(embedder.embedCalls).toHaveLength(1);
  });

  it("a different query still triggers a new embedding call", async () => {
    const { sql } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await searchCareer("first query");
    await searchCareer("second query");

    expect(embedder.embedCalls).toHaveLength(2);
  });

  it("applies documented defaults (topK, minScore) when no options are given", async () => {
    const rows = Array.from({ length: DEFAULT_TOP_K + 5 }, (_, i) =>
      fakeRow({ id: `chunk-${i}`, source_id: `source-${i}`, score: 1 - i / 100 }),
    );
    const { sql } = createFakeSql(rows);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query");

    expect(result.results).toHaveLength(DEFAULT_TOP_K);
    expect(DEFAULT_MIN_SCORE).toBe(0);
    expect(MIN_TOP_K).toBeLessThanOrEqual(DEFAULT_TOP_K);
    expect(MAX_TOP_K).toBeGreaterThanOrEqual(DEFAULT_TOP_K);
  });

  it("topK counts unique (sourceType, sourceId) records, not raw chunks: multiple chunks from one source count once", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", chunk_index: 0, score: 0.95 }),
      fakeRow({ id: "b", source_id: "proj-a", chunk_index: 1, score: 0.9 }),
      fakeRow({ id: "c", source_id: "proj-a", chunk_index: 2, score: 0.85 }),
      fakeRow({ id: "d", source_id: "proj-b", chunk_index: 0, score: 0.8 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { topK: 2 });

    expect(result.results.map((r) => r.sourceId)).toEqual(["proj-a", "proj-b"]);
  });

  it("keeps only the best-scoring chunk per source as the discovery excerpt and citation", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", chunk_index: 0, score: 0.5, content: "weak chunk" }),
      fakeRow({ id: "b", source_id: "proj-a", chunk_index: 1, score: 0.95, content: "best chunk" }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.text).toBe("best chunk");
    expect(result.results[0]?.score).toBe(0.95);
    expect(result.results[0]?.chunkIndex).toBe(1);
  });

  it("several higher-scoring chunks from one source cannot hide another qualifying source from topK", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a1", source_id: "proj-a", chunk_index: 0, score: 0.99 }),
      fakeRow({ id: "a2", source_id: "proj-a", chunk_index: 1, score: 0.98 }),
      fakeRow({ id: "a3", source_id: "proj-a", chunk_index: 2, score: 0.97 }),
      fakeRow({ id: "b1", source_id: "proj-b", chunk_index: 0, score: 0.6 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    // Even though proj-a alone produced 3 chunks that would have consumed a
    // naive chunk-level `LIMIT 3`, proj-b's single qualifying chunk must
    // still surface once source grouping is applied first.
    const result = await searchCareer("query", { topK: 3 });

    expect(result.results.map((r) => r.sourceId).sort()).toEqual(["proj-a", "proj-b"]);
  });

  it("breaks ties between equal-scoring sources deterministically by sourceId, then chunkIndex", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "b0", source_id: "proj-b", chunk_index: 0, score: 0.7 }),
      fakeRow({ id: "a1", source_id: "proj-a", chunk_index: 1, score: 0.7 }),
      fakeRow({ id: "a0", source_id: "proj-a", chunk_index: 0, score: 0.7 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const first = await searchCareer("query");
    const second = await searchCareer("query");

    // proj-a's best chunk (lowest chunkIndex among its tied-score chunks)
    // sorts before proj-b's, and repeated runs produce the identical order.
    expect(first.results.map((r) => `${r.sourceId}:${r.chunkIndex}`)).toEqual([
      "proj-a:0",
      "proj-b:0",
    ]);
    expect(second.results).toEqual(first.results);
  });

  it("breaks ties by sourceType before sourceId, even when two different source types share the same raw sourceId", async () => {
    const { sql } = createFakeSql([
      fakeRow({
        id: "b0",
        source_type: "story",
        source_id: "shared-id",
        chunk_index: 0,
        score: 0.7,
      }),
      fakeRow({
        id: "a0",
        source_type: "gap",
        source_id: "shared-id",
        chunk_index: 0,
        score: 0.7,
      }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query");

    expect(result.results.map((r) => r.sourceType)).toEqual(["gap", "story"]);
  });

  it("applies sourceType filtering before source grouping, so it never masks a distinct source of a different type", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "e1", source_type: "experience", source_id: "acme-role", score: 0.9 }),
      fakeRow({ id: "s1", source_type: "story", source_id: "acme-story", score: 0.8 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { sourceTypes: ["experience", "story"] });

    expect(result.results.map((r) => r.sourceType).sort()).toEqual(["experience", "story"]);
  });

  it("still returns fewer than topK sources when minScore excludes the rest (relevance-floor behavior unchanged)", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", source_id: "proj-a", score: 0.9 }),
      fakeRow({ id: "b", source_id: "proj-b", score: 0.1 }),
    ]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    const result = await searchCareer("query", { topK: 10, minScore: 0.5 });

    expect(result.results).toHaveLength(1);
  });

  it("exports RELEVANCE_FLOOR matching the eval-calibrated absent-topic cutoff (0.644), inside the meaningful similarity band", () => {
    expect(RELEVANCE_FLOOR).toBe(0.644);
    expect(RELEVANCE_FLOOR).toBeGreaterThan(DEFAULT_MIN_SCORE);
    expect(RELEVANCE_FLOOR).toBeLessThan(1);
  });

  it("defaults modelId to STORED_EMBEDDING_MODEL_ID, not the raw Google API model id, so it flags rows stored under the old identifier as a mismatch", async () => {
    const { sql } = createFakeSql([fakeRow({ embedding_model: MODEL_ID })]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder });

    await expect(searchCareer("architecture experience")).rejects.toThrow(
      StoredEmbeddingModelMismatchError,
    );
  });
});
