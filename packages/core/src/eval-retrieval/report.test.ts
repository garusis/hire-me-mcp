import { describe, expect, it } from "vitest";
import { buildRetrievalReport, type RetrievalCaseReport } from "./report.js";
import { RETRIEVAL_THRESHOLDS } from "./thresholds.js";

function caseReport(overrides: Partial<RetrievalCaseReport> = {}): RetrievalCaseReport {
  return {
    id: "case-1",
    category: "exact",
    query: "does he know typescript",
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    retrieved: [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
    metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
    expectEmptyCheck: null,
    passed: true,
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
    passed: true,
    ...overrides,
  };
}

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
      thresholds: { recallAtK: 0.5, precisionAtK: 0.5, mrr: 0.5, absentTopicAccuracy: 0.5 },
    });
    expect(report.verdict.passed).toBe(true);
  });

  it("produces a failing verdict when an aggregate misses the given thresholds", () => {
    const report = buildRetrievalReport({
      cases: [caseReport(), absentCaseReport()],
      topK: 5,
      absentTopicMinScore: 0.4,
      thresholds: { recallAtK: 1, precisionAtK: 1, mrr: 1, absentTopicAccuracy: 1.1 },
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
