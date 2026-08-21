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

  it("is calibrated against the #143 fixed-suite full-dataset run (17 cases, gemini-3.5-flash-lite) with a margin below the honest aggregate", () => {
    // Real aggregates from that run (after the #143 groundedness self-citation, redirect-language,
    // and relevance stemming fixes): groundedness 0.8824, gapHonesty 1.0000, relevance 0.5279 —
    // see packages/agent/README.md's "Real-run results" section for the full writeup and the
    // per-scorer rationale, including the residual known limitations this calibration does not
    // paper over.
    expect(EVAL_THRESHOLDS.groundedness).toBe(0.75);
    expect(EVAL_THRESHOLDS.gapHonesty).toBe(0.9);
    expect(EVAL_THRESHOLDS.relevance).toBe(0.48);
  });
});
