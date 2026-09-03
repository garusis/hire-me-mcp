import { describe, expect, it } from "vitest";
import { evaluateRetrievalVerdict, RETRIEVAL_THRESHOLDS } from "./thresholds.js";

describe("RETRIEVAL_THRESHOLDS", () => {
  it("every threshold is a finite number in [0, 1]", () => {
    for (const value of Object.values(RETRIEVAL_THRESHOLDS)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("RETRIEVAL_THRESHOLDS.preferredSourceCompliance (#295 correction)", () => {
  it("is 1.0 so any failed preferred-source case blocks the verdict rather than being averaged away", () => {
    expect(RETRIEVAL_THRESHOLDS.preferredSourceCompliance).toBe(1);
  });
});

describe("evaluateRetrievalVerdict", () => {
  const thresholds = {
    recallAtK: 0.6,
    precisionAtK: 0.3,
    mrr: 0.5,
    absentTopicAccuracy: 0.8,
    preferredSourceCompliance: 0.7,
  };

  it("passes when every aggregate meets its threshold", () => {
    const verdict = evaluateRetrievalVerdict(
      {
        recallAtK: 0.6,
        precisionAtK: 0.5,
        mrr: 0.8,
        absentTopicAccuracy: 1,
        preferredSourceCompliance: 0.7,
      },
      thresholds,
    );
    expect(verdict).toEqual({ passed: true, failures: [] });
  });

  it("fails and names each aggregate that falls below its threshold", () => {
    const verdict = evaluateRetrievalVerdict(
      {
        recallAtK: 0.5,
        precisionAtK: 0.5,
        mrr: 0.8,
        absentTopicAccuracy: 1,
        preferredSourceCompliance: 0.7,
      },
      thresholds,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0]).toContain("recall@k");
  });

  it("reports every failing aggregate, not just the first", () => {
    const verdict = evaluateRetrievalVerdict(
      {
        recallAtK: 0,
        precisionAtK: 0,
        mrr: 0,
        absentTopicAccuracy: 0,
        preferredSourceCompliance: 0,
      },
      thresholds,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(5);
  });

  it("a value exactly at its threshold passes (>=, not >)", () => {
    const verdict = evaluateRetrievalVerdict(
      {
        recallAtK: 0.6,
        precisionAtK: 0.3,
        mrr: 0.5,
        absentTopicAccuracy: 0.8,
        preferredSourceCompliance: 0.7,
      },
      thresholds,
    );
    expect(verdict).toEqual({ passed: true, failures: [] });
  });

  it("uses the committed RETRIEVAL_THRESHOLDS by default", () => {
    const verdict = evaluateRetrievalVerdict({
      recallAtK: 1,
      precisionAtK: 1,
      mrr: 1,
      absentTopicAccuracy: 1,
      preferredSourceCompliance: 1,
    });
    expect(verdict).toEqual({ passed: true, failures: [] });
  });

  it("names preferredSourceCompliance failures separately from recall/precision/MRR/absent-topic", () => {
    const verdict = evaluateRetrievalVerdict(
      {
        recallAtK: 0.6,
        precisionAtK: 0.5,
        mrr: 0.8,
        absentTopicAccuracy: 1,
        preferredSourceCompliance: 0.4,
      },
      thresholds,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0]).toContain("preferred-source compliance");
  });
});
