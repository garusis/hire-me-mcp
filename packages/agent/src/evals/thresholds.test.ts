import { describe, expect, it } from "vitest";
import { EVAL_THRESHOLDS, evaluateVerdict } from "./thresholds.js";

describe("evaluateVerdict", () => {
  const thresholds = { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.6 };

  it("passes when every aggregate meets or exceeds its threshold", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.75, relevance: 0.6 },
      thresholds,
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toHaveLength(0);
  });

  it("fails and names the scorer when one aggregate falls below its threshold", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.5, gapHonesty: 0.75, relevance: 0.6 },
      thresholds,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0]).toMatch(/groundedness/i);
  });

  it("collects every failing scorer, not just the first", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.1, gapHonesty: 0.1, relevance: 0.6 },
      thresholds,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(2);
  });

  it("uses the committed EVAL_THRESHOLDS as its default", () => {
    const verdict = evaluateVerdict({
      groundedness: EVAL_THRESHOLDS.groundedness,
      gapHonesty: EVAL_THRESHOLDS.gapHonesty,
      relevance: EVAL_THRESHOLDS.relevance,
    });
    expect(verdict.passed).toBe(true);
  });
});
