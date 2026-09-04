import { describe, expect, it } from "vitest";
import type { GoldenQuery } from "./dataset/schema.js";
import { isStoryOnlyCase, runRetrievalEval, selectScoringRetrieved } from "./runner.js";
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

  it("leaves storyScoped metrics null for a case whose expectedSources contain no story (Codex checkpoint correction)", async () => {
    const { searchCareer } = fakeSearchCareer({
      "does he know typescript": [
        { sourceType: "skill", sourceId: "typescript", score: 0.9 },
        { sourceType: "story", sourceId: "unrelated-story", score: 0.3 },
      ],
    });

    const report = await runRetrievalEval(
      { queries: [query()], topK: 5, absentTopicMinScore: 0.4 },
      { searchCareer },
    );

    expect(report.cases[0]?.lanes.storyScoped.metrics).toBeNull();
    expect(report.cases[0]?.lanes.storyScoped.retrievedIds).toEqual(["story:unrelated-story"]);
    expect(report.cases[0]?.lanes.unscoped.metrics).not.toBeNull();
  });

  it("scores storyScoped only against the story-only subset of expectedSources for a mixed cross-cutting case (Codex checkpoint correction)", async () => {
    const { searchCareer } = fakeSearchCareer({
      "what has he built end to end": [{ sourceType: "story", sourceId: "the-story", score: 0.6 }],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "mixed-cross-cutting",
            query: "what has he built end to end",
            category: "cross-cutting",
            expectedSources: [
              { sourceType: "skill", sourceId: "typescript" },
              { sourceType: "story", sourceId: "the-story" },
            ],
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    // unscoped recall is 1/2 (only the story half of the mixed expectedSources is retrievable in this lane's result set)
    expect(report.cases[0]?.lanes.unscoped.metrics?.recallAtK).toBe(0.5);
    // storyScoped recall is scored only against the story subset ({ story: the-story }), which IS retrieved -> 1, not 0.5
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

  it("routes top-level metrics/passed from the storyScoped lane for a case whose expectedSources are exclusively story sources (#307 owner-authorized correction)", async () => {
    const { searchCareer } = fakeSearchCareer({
      "tell me about a time he stepped into leadership": [
        { sourceType: "recommendation", sourceId: "crowd-out", score: 0.95 },
        { sourceType: "recommendation", sourceId: "crowd-out-2", score: 0.9 },
        { sourceType: "story", sourceId: "leadership-story", score: 0.7 },
      ],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "story-only-lane-routing",
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

    const c = report.cases[0];
    // unscoped would score reciprocalRank 1/3 (two recommendations outrank the story); storyScoped scores 1.
    expect(c?.lanes.unscoped.metrics?.reciprocalRank).toBeCloseTo(1 / 3);
    expect(c?.metrics).toEqual(c?.lanes.storyScoped.metrics);
    expect(c?.metrics).toEqual({ recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 });
    expect(c?.matchModePassed).toBe(true);
    expect(c?.passed).toBe(true);
  });

  it("routes a story-only case's preferredSource check from the storyScoped lane, not unscoped — lanes genuinely disagree", async () => {
    // A hand-rolled, lane-aware searcher: the unscoped call gets a DIFFERENT raw order than
    // the story-scoped call (not merely the same list post-filtered), the way a real vector
    // search over a narrower candidate pool can rank the same documents differently. This is
    // deliberately NOT `fakeSearchCareer` (which returns one list filtered by sourceType, so
    // relative order among stories is identical in both lanes and can never catch a routing
    // regression that reads from the wrong lane).
    const calls: Array<{ sourceTypes?: readonly string[] }> = [];
    const searchCareer = async (_text: string, options?: { sourceTypes?: readonly string[] }) => {
      calls.push({ sourceTypes: options?.sourceTypes });
      const isStoryScoped = options?.sourceTypes?.includes("story") === true;
      const results = isStoryScoped
        ? [
            { sourceType: "story", sourceId: "preferred", score: 0.9 },
            { sourceType: "story", sourceId: "alt", score: 0.5 },
          ]
        : [
            { sourceType: "story", sourceId: "alt", score: 0.95 },
            { sourceType: "story", sourceId: "preferred", score: 0.6 },
          ];
      return {
        query: _text,
        tookMs: 1,
        results: results.map((r) => ({
          ...r,
          text: "",
          citation: { entityType: r.sourceType, entityId: r.sourceId, label: r.sourceId },
          chunkIndex: 0,
        })),
      };
    };

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "story-only-preference-routing",
            query: "mission over financial benefit",
            category: "fuzzy",
            expectedSources: [
              { sourceType: "story", sourceId: "preferred" },
              { sourceType: "story", sourceId: "alt" },
            ],
            matchMode: "any",
            preferredSource: { sourceType: "story", sourceId: "preferred" },
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    const c = report.cases[0];
    // In the unscoped lane, "alt" outranks "preferred" -> preference would FAIL if scored there.
    expect(c?.lanes.unscoped.metrics?.reciprocalRank).toBe(1); // "alt" is expected too, so recall/MRR are fine — it's the preference that differs.
    // In the story-scoped lane, "preferred" outranks "alt" -> preference PASSES there.
    expect(c?.lanes.storyScoped.retrievedIds).toEqual(["story:preferred", "story:alt"]);
    // Top-level must reflect the storyScoped lane, not unscoped: preference passes, and
    // top-level `retrieved` is exactly the story-scoped raw result (not the unscoped one).
    expect(c?.preferencePassed).toBe(true);
    expect(c?.preferredSourceReciprocalRank).toBe(1);
    expect(c?.retrieved).toEqual([
      { sourceType: "story", sourceId: "preferred", score: 0.9 },
      { sourceType: "story", sourceId: "alt", score: 0.5 },
    ]);
    expect(c?.retrieved).not.toEqual(c?.lanes.unscoped.retrievedIds);
  });

  it("keeps top-level metrics on the unscoped lane for a mixed (non-story-only) case, even though it has a story in expectedSources", async () => {
    const { searchCareer } = fakeSearchCareer({
      "what has he built end to end": [{ sourceType: "story", sourceId: "the-story", score: 0.6 }],
    });

    const report = await runRetrievalEval(
      {
        queries: [
          query({
            id: "mixed-case-stays-unscoped",
            query: "what has he built end to end",
            category: "cross-cutting",
            expectedSources: [
              { sourceType: "skill", sourceId: "typescript" },
              { sourceType: "story", sourceId: "the-story" },
            ],
          }),
        ],
        topK: 5,
        absentTopicMinScore: 0.4,
      },
      { searchCareer },
    );

    const c = report.cases[0];
    expect(c?.metrics).toEqual(c?.lanes.unscoped.metrics);
    expect(c?.metrics?.recallAtK).toBe(0.5);
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

describe("isStoryOnlyCase / selectScoringRetrieved (#307 lane-routing units)", () => {
  it("isStoryOnlyCase is true only when expectedSources is non-empty and every entry is a story source", () => {
    expect(
      isStoryOnlyCase(query({ expectedSources: [{ sourceType: "story", sourceId: "a" }] })),
    ).toBe(true);
    expect(
      isStoryOnlyCase(
        query({
          expectedSources: [
            { sourceType: "story", sourceId: "a" },
            { sourceType: "skill", sourceId: "b" },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isStoryOnlyCase(query({ expectedSources: [{ sourceType: "skill", sourceId: "b" }] })),
    ).toBe(false);
    expect(isStoryOnlyCase(absentQuery({ expectedSources: [] }))).toBe(false);
  });

  it("selectScoringRetrieved returns the story-scoped array for a story-only case", () => {
    const storyOnly = query({ expectedSources: [{ sourceType: "story", sourceId: "a" }] });
    const unscoped = [{ sourceType: "skill", sourceId: "z", score: 0.1 }];
    const storyScoped = [{ sourceType: "story", sourceId: "a", score: 0.9 }];
    expect(selectScoringRetrieved(storyOnly, unscoped, storyScoped)).toEqual(storyScoped);
  });

  it("selectScoringRetrieved returns the unscoped array for a mixed (not exclusively story) case", () => {
    const mixed = query({
      expectedSources: [
        { sourceType: "skill", sourceId: "z" },
        { sourceType: "story", sourceId: "a" },
      ],
    });
    const unscoped = [{ sourceType: "skill", sourceId: "z", score: 0.9 }];
    const storyScoped = [{ sourceType: "story", sourceId: "a", score: 0.9 }];
    expect(selectScoringRetrieved(mixed, unscoped, storyScoped)).toEqual(unscoped);
  });

  it("selectScoringRetrieved returns a genuinely independent, mutable array, never an alias of its readonly inputs", () => {
    const storyOnly = query({ expectedSources: [{ sourceType: "story", sourceId: "a" }] });
    const storyScopedInput: ReadonlyArray<{ sourceType: string; sourceId: string; score: number }> =
      [{ sourceType: "story", sourceId: "a", score: 0.9 }];
    const result = selectScoringRetrieved(storyOnly, [], storyScopedInput);
    result.push({ sourceType: "story", sourceId: "b", score: 0.1 });
    expect(result).toHaveLength(2);
    expect(storyScopedInput).toHaveLength(1);
  });
});
