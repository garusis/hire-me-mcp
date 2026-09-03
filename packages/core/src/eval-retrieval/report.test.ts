import { describe, expect, it } from "vitest";
import {
  buildRetrievalReport,
  type RetrievalCaseReport,
  type RetrievalLaneResult,
} from "./report.js";
import { RETRIEVAL_THRESHOLDS } from "./thresholds.js";

function laneResult(overrides: Partial<RetrievalLaneResult> = {}): RetrievalLaneResult {
  return {
    lane: "unscoped",
    retrievedIds: ["skill:typescript"],
    metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
    ...overrides,
  };
}

function caseReport(overrides: Partial<RetrievalCaseReport> = {}): RetrievalCaseReport {
  return {
    id: "case-1",
    category: "exact",
    query: "does he know typescript",
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    retrieved: [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
    expectEmptyCheck: null,
    matchMode: "all",
    preferredSource: null,
    matchModePassed: true,
    preferencePassed: null,
    preferredSourceReciprocalRank: null,
    passed: true,
    lanes: {
      unscoped: laneResult(),
      storyScoped: laneResult({
        lane: "storyScoped",
        retrievedIds: [],
        metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
      }),
    },
    ...overrides,
  };
}

function absentCaseReport(overrides: Partial<RetrievalCaseReport> = {}): RetrievalCaseReport {
  return {
    id: "absent-1",
    category: "absent-topic",
    query: "blockchain experience",
    expectedSources: [],
    retrieved: [],
    metrics: null,
    expectEmptyCheck: { passed: true, aboveThreshold: [] },
    matchMode: "all",
    preferredSource: null,
    matchModePassed: true,
    preferencePassed: null,
    preferredSourceReciprocalRank: null,
    passed: true,
    lanes: {
      unscoped: laneResult({ retrievedIds: [], metrics: null }),
      storyScoped: laneResult({ lane: "storyScoped", retrievedIds: [], metrics: null }),
    },
    ...overrides,
  };
}

function preferenceCaseReport(overrides: Partial<RetrievalCaseReport> = {}): RetrievalCaseReport {
  return {
    id: "preference-1",
    category: "fuzzy",
    query: "tell me about a time he stepped into leadership",
    expectedSources: [
      { sourceType: "story", sourceId: "preferred" },
      { sourceType: "story", sourceId: "alt" },
    ],
    retrieved: [
      { sourceType: "story", sourceId: "preferred", score: 0.9 },
      { sourceType: "story", sourceId: "alt", score: 0.8 },
    ],
    metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
    expectEmptyCheck: null,
    matchMode: "any",
    preferredSource: { sourceType: "story", sourceId: "preferred" },
    matchModePassed: true,
    preferencePassed: true,
    preferredSourceReciprocalRank: 1,
    passed: true,
    lanes: {
      unscoped: laneResult({
        retrievedIds: ["story:preferred", "story:alt"],
        metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
      }),
      storyScoped: laneResult({
        lane: "storyScoped",
        retrievedIds: ["story:preferred", "story:alt"],
        metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
      }),
    },
    ...overrides,
  };
}

describe("buildRetrievalReport: preferredSourceCompliance (#295)", () => {
  it("computes preferredSourceCompliance as the fraction of preference-declaring cases whose preference passed", () => {
    const report = buildRetrievalReport({
      cases: [
        preferenceCaseReport({ id: "a", preferencePassed: true }),
        preferenceCaseReport({ id: "b", preferencePassed: false }),
        caseReport(),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.preferredSourceCompliance).toBeCloseTo(0.5, 10);
  });

  it("edge case: no preference-declaring cases -> preferredSourceCompliance is 1 (vacuously satisfied)", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.preferredSourceCompliance).toBe(1);
  });

  it("carries matchMode/preferredSource/matchModePassed/preferencePassed verbatim in the per-case report", () => {
    const cases = [preferenceCaseReport()];
    const report = buildRetrievalReport({ cases, topK: 5, absentTopicMinScore: 0.4 });
    expect(report.cases[0]).toEqual(cases[0]);
  });

  it("a single failed preferred-source case blocks the overall verdict under the committed thresholds even when most preference cases pass (#295 correction: preference is blocking, not merely observational/averaged)", () => {
    const report = buildRetrievalReport({
      cases: [
        preferenceCaseReport({ id: "a", preferencePassed: true }),
        preferenceCaseReport({ id: "b", preferencePassed: true }),
        preferenceCaseReport({ id: "c", preferencePassed: true }),
        preferenceCaseReport({ id: "d", preferencePassed: true }),
        preferenceCaseReport({
          id: "e",
          preferencePassed: false,
          preferredSourceReciprocalRank: 0,
          passed: false,
        }),
        caseReport(),
        absentCaseReport(),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.preferredSourceCompliance).toBeCloseTo(0.8, 10);
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((f) => f.includes("preferred-source compliance"))).toBe(
      true,
    );
  });
});

describe("buildRetrievalReport", () => {
  it("computes recall/precision/MRR aggregates as the mean over non-absent-topic cases only", () => {
    const report = buildRetrievalReport({
      cases: [
        caseReport({ id: "a", metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 } }),
        caseReport({
          id: "b",
          metrics: { recallAtK: 0.5, precisionAtK: 0.5, reciprocalRank: 0.5 },
        }),
        absentCaseReport(),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });

    expect(report.aggregates.recallAtK).toBeCloseTo(0.75, 10);
    expect(report.aggregates.precisionAtK).toBeCloseTo(0.75, 10);
    expect(report.aggregates.mrr).toBeCloseTo(0.75, 10);
  });

  it("computes absentTopicAccuracy as the fraction of absent-topic cases that passed", () => {
    const report = buildRetrievalReport({
      cases: [
        absentCaseReport({ id: "a", passed: true }),
        absentCaseReport({ id: "b", passed: false }),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.absentTopicAccuracy).toBeCloseTo(0.5, 10);
  });

  it("edge case: no absent-topic cases -> absentTopicAccuracy is 1 (vacuously satisfied)", () => {
    const report = buildRetrievalReport({
      cases: [caseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.absentTopicAccuracy).toBe(1);
  });

  it("edge case: no non-absent-topic cases -> recall/precision/mrr aggregates are 0, not NaN", () => {
    const report = buildRetrievalReport({
      cases: [absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.aggregates.recallAtK).toBe(0);
    expect(report.aggregates.precisionAtK).toBe(0);
    expect(report.aggregates.mrr).toBe(0);
  });

  it("produces a passing verdict when every aggregate clears the given thresholds", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
      thresholds: {
        recallAtK: 0.5,
        precisionAtK: 0.5,
        mrr: 0.5,
        absentTopicAccuracy: 0.5,
        preferredSourceCompliance: 0.5,
      },
    });
    expect(report.verdict.passed).toBe(true);
  });

  it("produces a failing verdict when an aggregate misses the given thresholds", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
      thresholds: {
        recallAtK: 1,
        precisionAtK: 1,
        mrr: 1,
        absentTopicAccuracy: 1.1,
        preferredSourceCompliance: 1,
      },
    });
    expect(report.verdict.passed).toBe(false);
  });

  it("uses the committed RETRIEVAL_THRESHOLDS by default", () => {
    const report = buildRetrievalReport({
      cases: [caseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });
    expect(report.thresholds).toEqual(RETRIEVAL_THRESHOLDS);
  });

  it("round-trips through JSON.stringify/parse (report is plain, serializable data)", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("includes topK, absentTopicMinScore, and every per-case report verbatim", () => {
    const cases = [caseReport(), absentCaseReport()];
    const report = buildRetrievalReport({ cases, topK: 7, absentTopicMinScore: 0.42 });
    expect(report.topK).toBe(7);
    expect(report.absentTopicMinScore).toBe(0.42);
    expect(report.cases).toEqual(cases);
  });
});

describe("buildRetrievalReport: lane aggregates (#307)", () => {
  it("computes separate recall/precision/MRR aggregates per lane, over cases with a non-null lane metric", () => {
    const report = buildRetrievalReport({
      cases: [
        caseReport({
          id: "a",
          lanes: {
            unscoped: laneResult({ metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 } }),
            storyScoped: laneResult({
              lane: "storyScoped",
              retrievedIds: [],
              metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
            }),
          },
        }),
        caseReport({
          id: "b",
          lanes: {
            unscoped: laneResult({
              metrics: { recallAtK: 0.5, precisionAtK: 0.5, reciprocalRank: 0.5 },
            }),
            storyScoped: laneResult({
              lane: "storyScoped",
              retrievedIds: ["story:x"],
              metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
            }),
          },
        }),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });

    expect(report.aggregates.lanes.unscoped).toEqual({
      recallAtK: 0.75,
      precisionAtK: 0.75,
      mrr: 0.75,
      scoredCases: 2,
    });
    expect(report.aggregates.lanes.storyScoped).toEqual({
      recallAtK: 0.5,
      precisionAtK: 0.5,
      mrr: 0.5,
      scoredCases: 2,
    });
  });

  it("excludes absent-topic (null-metric) cases from each lane's aggregate, same as the top-level aggregate", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });

    expect(report.aggregates.lanes.unscoped.recallAtK).toBe(1);
    expect(report.aggregates.lanes.storyScoped.recallAtK).toBe(0);
  });

  it("edge case: no cases with a non-null lane metric -> lane aggregate is 0, not NaN", () => {
    const report = buildRetrievalReport({
      cases: [absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
    });

    expect(report.aggregates.lanes.unscoped).toEqual({
      recallAtK: 0,
      precisionAtK: 0,
      mrr: 0,
      scoredCases: 0,
    });
    expect(report.aggregates.lanes.storyScoped).toEqual({
      recallAtK: 0,
      precisionAtK: 0,
      mrr: 0,
      scoredCases: 0,
    });
  });

  it("carries each case's lane identity and ordered, deduplicated result ids verbatim", () => {
    const cases = [preferenceCaseReport()];
    const report = buildRetrievalReport({ cases, topK: 5, absentTopicMinScore: 0.4 });

    expect(report.cases[0]?.lanes.unscoped.lane).toBe("unscoped");
    expect(report.cases[0]?.lanes.storyScoped.lane).toBe("storyScoped");
    expect(report.cases[0]?.lanes.unscoped.retrievedIds).toEqual(["story:preferred", "story:alt"]);
  });

  it("exposes each lane aggregate's scored-case count as the explicit denominator (Codex checkpoint correction)", () => {
    const report = buildRetrievalReport({
      cases: [
        caseReport({ id: "a" }),
        caseReport({
          id: "b",
          lanes: {
            unscoped: laneResult({ metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 } }),
            storyScoped: laneResult({ lane: "storyScoped", retrievedIds: [], metrics: null }),
          },
        }),
        absentCaseReport(),
      ],
      topK: 5,
      absentTopicMinScore: 0.4,
    });

    expect(report.aggregates.lanes.unscoped.scoredCases).toBe(2);
    expect(report.aggregates.lanes.storyScoped.scoredCases).toBe(1);
  });
});
