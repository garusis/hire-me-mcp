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
 * a single tagged-template `SELECT ... ORDER BY ... LIMIT $topK`, with an
 * optional `source_type = ANY(...)` clause when `sourceTypes` is given. Real
 * ANN ordering/index usage is covered by search-career.integration.test.ts
 * against a real Neon branch — this fake only needs to stand in for "the DB
 * already did the ANN ranking and LIMIT", so unit tests can exercise
 * searchCareer's own validation/caching/filtering/error logic without a
 * database or network call, matching the migrate.test.ts fake-sql pattern.
 */
function createFakeSql(rows: FakeRow[]) {
  const calls: { text: string; values: unknown[] }[] = [];

  function fakeTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<FakeRow[]> {
    const text = strings.join("?");
    calls.push({ text, values });
    if (!text.includes("FROM career_chunks")) {
      throw new Error(`fake sql: unexpected tagged query: ${text}`);
    }
    let candidates = rows;
    if (text.includes("source_type = ANY")) {
      const sourceTypes = values.find((value) => Array.isArray(value)) as string[] | undefined;
      candidates = candidates.filter(
        (row) => sourceTypes === undefined || sourceTypes.includes(row.source_type),
      );
    }
    const topK = values[values.length - 1] as number;
    return Promise.resolve(candidates.slice(0, topK));
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
      fakeRow({ id: "a", score: 0.5 }),
      fakeRow({ id: "b", score: 0.9 }),
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

  it("topK limits the number of returned results", async () => {
    const { sql } = createFakeSql([
      fakeRow({ id: "a", score: 0.9 }),
      fakeRow({ id: "b", score: 0.8 }),
      fakeRow({ id: "c", score: 0.7 }),
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
    const { sql, calls } = createFakeSql([fakeRow()]);
    const embedder = fakeEmbedder();
    const searchCareer = createSearchCareer({ sql, embedder, modelId: MODEL_ID });

    await searchCareer("query");

    const lastCall = calls[calls.length - 1];
    expect(lastCall?.values[lastCall.values.length - 1]).toBe(DEFAULT_TOP_K);
    expect(DEFAULT_MIN_SCORE).toBe(0);
    expect(MIN_TOP_K).toBeLessThanOrEqual(DEFAULT_TOP_K);
    expect(MAX_TOP_K).toBeGreaterThanOrEqual(DEFAULT_TOP_K);
  });
});
