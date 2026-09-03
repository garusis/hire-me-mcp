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
  const calls: Array<{
    query: string;
    options?: { topK?: number; sourceTypes?: readonly string[] };
  }> = [];
  return {
    calls,
    async searchCareer(
      text: string,
      options?: { topK?: number; minScore?: number; sourceTypes?: readonly string[] },
    ) {
      calls.push({ query: text, options });
      const results = resultsByQuery[text] ?? [];
      const scoped =
        options?.sourceTypes === undefined
          ? results
          : results.filter((r) => options.sourceTypes?.includes(r.sourceType));
      return {
        query: text,
        results: scoped.map((r) => ({
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

describe("runRetrievalEval: retrieval lanes (#307)", () => {
  it("calls searchCareer twice per query: once unscoped, once with sourceTypes: ['story']", async () => {
    const { searchCareer, calls } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.options?.sourceTypes).toBeUndefined();
    expect(calls[1]?.options?.sourceTypes).toEqual(["story"]);
  });

  it("scores the unscoped lane identically to the case's top-level metrics", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    const report = await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.lanes.unscoped.lane).toBe("unscoped");
    expect(report.cases[0]?.lanes.unscoped.metrics).toEqual(report.cases[0]?.metrics);
    expect(report.cases[0]?.lanes.unscoped.retrievedIds).toEqual(["skill:typescript"]);
  });

  it("scores the story-scoped lane against only the story-typed results searchCareer returned for that lane", async () => {
    const { searchCareer } = fakeSearchCareer({
      "tell me about a time he stepped into leadership": [
        { sourceType: "experience", sourceId: "acme", score: 0.95 },
        { sourceType: "story", sourceId: "leadership-story", score: 0.7 },
      ],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "story-lane",
            query: "tell me about a time he stepped into leadership",
            category: "fuzzy",
            expectedSources: [{ sourceType: "story", sourceId: "leadership-story" }],
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    expect(report.cases[0]?.lanes.unscoped.retrievedIds).toEqual([
      "experience:acme",
      "story:leadership-story",
    ]);
    expect(report.cases[0]?.lanes.unscoped.metrics?.reciprocalRank).toBe(0.5);
    expect(report.cases[0]?.lanes.storyScoped.retrievedIds).toEqual(["story:leadership-story"]);
    expect(report.cases[0]?.lanes.storyScoped.metrics).toEqual({
      recallAtK: 1,
      precisionAtK: 1,
      reciprocalRank: 1,
    });
  });

  it("leaves both lanes' metrics null for an absent-topic case, but still records what each lane retrieved", async () => {
    const { searchCareer } = fakeSearchCareer({
      "blockchain experience": [{ sourceType: "story", sourceId: "unrelated-story", score: 0.2 }],
    });

    const report = await runRetrievalEval(
      { queries: [absentQuery()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.lanes.unscoped.metrics).toBeNull();
    expect(report.cases[0]?.lanes.storyScoped.metrics).toBeNull();
    expect(report.cases[0]?.lanes.storyScoped.retrievedIds).toEqual(["story:unrelated-story"]);
  });

  it("passes the configured topK to both the unscoped and story-scoped searchCareer calls", async () => {
    const { searchCareer, calls } = fakeSearchCareer({
      "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    });

    await runRetrievalEval(
      { queries: [query()], topK: 9, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(calls[0]?.options?.topK).toBe(9);
    expect(calls[1]?.options?.topK).toBe(9);
  });
});
