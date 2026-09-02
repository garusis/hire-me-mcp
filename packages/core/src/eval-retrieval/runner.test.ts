import { describe, expect, it } from "vitest";
import type { GoldenQuery } from "./dataset/schema.js";
import { runRetrievalEval } from "./runner.js";
import { RETRIEVAL_THRESHOLDS } from "./thresholds.js";

function query(overrides: Partial<GoldenQuery> = {}): GoldenQuery {
  return {
    id: "exact-typescript",
    query: "does he know typescript",
    category: "exact",
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    ...overrides,
  };
}

function absentQuery(overrides: Partial<GoldenQuery> = {}): GoldenQuery {
  return {
    id: "absent-blockchain",
    query: "blockchain experience",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    ...overrides,
  };
}

function fakeSearchCareer(
  resultsByQuery: Record<string, Array<{ sourceType: string; sourceId: string; score: number }>>,
) {
  const calls: Array<{ query: string; options?: unknown }> = [];
  return {
    calls,
    async searchCareer(text: string, options?: { topK?: number; minScore?: number }) {
      calls.push({ query: text, options });
      const results = resultsByQuery[text] ?? [];
      return {
        query: text,
        results: results.map((r) => ({
          text: `chunk for ${r.sourceId}`,
          score: r.score,
          citation: { entityType: r.sourceType, entityId: r.sourceId, label: r.sourceId },
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          chunkIndex: 0,
        })),
        tookMs: 1,
      };
    },
  };
}

describe("runRetrievalEval", () => {
  it("scores a matching exact-category query as passed with recall/precision/MRR of 1", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]?.passed).toBe(true);
    expect(report.cases[0]?.metrics).toEqual({ recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 });
  });

  it("scores a query that retrieved nothing relevant as failed with recall 0", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "rust", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(false);
    expect(report.cases[0]?.metrics?.recallAtK).toBe(0);
  });

  it("calls searchCareer with the configured topK for every query", async () => {
    const { searchCareer, calls } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    await runRetrievalEval(
      { queries: [query()], topK: 7, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(calls[0]?.query).toBe("does he know typescript");
    expect((calls[0]?.options as { topK?: number } | undefined)?.topK).toBe(7);
  });

  it("scores an absent-topic query with nothing above the threshold as passed", async () => {
    const { searchCareer } = fakeSearchCareer({
      "blockchain experience": [{ sourceType: "skill", sourceId: "typescript", score: 0.1 }],
    });

    const report = await runRetrievalEval(
      { queries: [absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(true);
    expect(report.cases[0]?.metrics).toBeNull();
    expect(report.cases[0]?.expectEmptyCheck?.passed).toBe(true);
  });

  it("scores an absent-topic query with a result above the threshold as failed", async () => {
    const { searchCareer } = fakeSearchCareer({
      "blockchain experience": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(false);
    expect(report.cases[0]?.expectEmptyCheck?.aboveThreshold).toHaveLength(1);
  });

  it("aggregates and verdict reflect every case in the run", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
      "blockchain experience": [],
    });

    const report = await runRetrievalEval(
      { queries: [query(), absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.aggregates.recallAtK).toBe(1);
    expect(report.aggregates.absentTopicAccuracy).toBe(1);
    expect(report.thresholds).toEqual(RETRIEVAL_THRESHOLDS);
    expect(report.verdict.passed).toBe(true);
  });

  it("scores a matchMode: 'any' query as passed when only one acceptable source is retrieved", async () => {
    const { searchCareer } = fakeSearchCareer({
      "leadership without formal authority": [{ sourceType: "story", sourceId: "a", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "any-leadership",
            query: "leadership without formal authority",
            category: "fuzzy",
            expectedSources: [
              { sourceType: "story", sourceId: "a" },
              { sourceType: "story", sourceId: "b" },
            ],
            matchMode: "any",
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(true);
    expect(report.cases[0]?.matchModePassed).toBe(true);
    expect(report.cases[0]?.metrics?.recallAtK).toBe(1);
  });

  it("fails a case whose preferredSource is outranked by an acceptable alternative", async () => {
    const { searchCareer } = fakeSearchCareer({
      "leadership without formal authority": [
        { sourceType: "story", sourceId: "b", score: 0.9 },
        { sourceType: "story", sourceId: "a", score: 0.8 },
      ],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "preferred-leadership",
            query: "leadership without formal authority",
            category: "fuzzy",
            expectedSources: [
              { sourceType: "story", sourceId: "a" },
              { sourceType: "story", sourceId: "b" },
            ],
            matchMode: "any",
            preferredSource: { sourceType: "story", sourceId: "a" },
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    expect(report.cases[0]?.matchModePassed).toBe(true);
    expect(report.cases[0]?.preferencePassed).toBe(false);
    expect(report.cases[0]?.passed).toBe(false);
  });

  it("passes a case whose preferredSource is retrieved and outranks every acceptable alternative", async () => {
    const { searchCareer } = fakeSearchCareer({
      "leadership without formal authority": [
        { sourceType: "story", sourceId: "a", score: 0.9 },
        { sourceType: "story", sourceId: "b", score: 0.8 },
      ],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "preferred-leadership-ok",
            query: "leadership without formal authority",
            category: "fuzzy",
            expectedSources: [
              { sourceType: "story", sourceId: "a" },
              { sourceType: "story", sourceId: "b" },
            ],
            matchMode: "any",
            preferredSource: { sourceType: "story", sourceId: "a" },
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    expect(report.cases[0]?.preferencePassed).toBe(true);
    expect(report.cases[0]?.passed).toBe(true);
  });

  it("leaves preferencePassed null for a case that declares no preferredSource", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.preferencePassed).toBeNull();
    expect(report.cases[0]?.preferredSourceReciprocalRank).toBeNull();
  });

  it("scores an absent-topic query's matchModePassed as vacuously true even when it fails (#295 correction)", async () => {
    const { searchCareer } = fakeSearchCareer({
      "blockchain experience": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(false);
    expect(report.cases[0]?.matchModePassed).toBe(true);
  });

  it("scores an absent-topic query's matchModePassed as vacuously true when it passes (#295 correction)", async () => {
    const { searchCareer } = fakeSearchCareer({
      "blockchain experience": [{ sourceType: "skill", sourceId: "typescript", score: 0.1 }],
    });

    const report = await runRetrievalEval(
      { queries: [absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.passed).toBe(true);
    expect(report.cases[0]?.matchModePassed).toBe(true);
  });

  it("produces an empty report for an empty query list", async () => {
    const { searchCareer } = fakeSearchCareer({});
    const report = await runRetrievalEval(
      { queries: [], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );
    expect(report.cases).toEqual([]);
  });
});
