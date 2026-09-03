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

  it("carries a provisional answerAssertions threshold (#300), optional like toolRouting", () => {
    expect(EVAL_THRESHOLDS.answerAssertions).toBe(0.8);
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6, answerAssertions: 0.2 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.5, answerAssertions: 0.8 },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((line) => /answer assertions/i.test(line))).toBe(true);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 2): `storyCompleteness` (`./scorers/story-completeness.ts`)
   * gets the same optional, provisional-threshold treatment as
   * `answerAssertions`/`toolRouting` above.
   */
  it("carries a provisional storyCompleteness threshold (#295), optional like answerAssertions/toolRouting", () => {
    expect(EVAL_THRESHOLDS.storyCompleteness).toBe(0.7);
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6, storyCompleteness: 0.2 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.5, storyCompleteness: 0.7 },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((line) => /story completeness/i.test(line))).toBe(true);
  });

  /**
   * #295 second independent-review correction (finding 4): unlike every
   * other optional threshold above, preferred-source compliance is
   * BLOCKING (1.0) — a declared preference is a locked per-case contract,
   * not a statistical target that tolerates a fraction of failures. Same
   * pinned-literal pattern as the retrieval package's own
   * `preferredSourceCompliance` fix.
   */
  it("carries a blocking (1.0) preferredSourceCompliance threshold (#295), unlike the other optional scorers", () => {
    expect(EVAL_THRESHOLDS.preferredSourceCompliance).toBe(1);
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6, preferredSourceCompliance: 0.8 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.5, preferredSourceCompliance: 1 },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((line) => /preferred.source/i.test(line))).toBe(true);
  });

  /**
   * #295 fourth independent-review correction, finding 2: "The new blocking
   * verdict contract is not pinned end to end... it would remain green if
   * the threshold were lowered/removed or the aggregate stopped gating the
   * verdict." Same pinned-literal-plus-blocking-verdict pattern as
   * `preferredSourceCompliance`'s own test above — a declared factual
   * boundary is a locked per-case contract, not a statistical target.
   */
  it("carries a blocking (1.0) factualBoundaryCompliance threshold (#295), unlike the other optional scorers", () => {
    expect(EVAL_THRESHOLDS.factualBoundaryCompliance).toBe(1);
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6, factualBoundaryCompliance: 0.8 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.5, factualBoundaryCompliance: 1 },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((line) => /factual.boundary/i.test(line))).toBe(true);
  });

  it("carries a provisional toolRouting threshold (#75), flagged as uncalibrated pending a real CI run", () => {
    expect(EVAL_THRESHOLDS.toolRouting).toBe(0.6);
  });

  it("skips an unset threshold key without crashing or failing the verdict (toolRouting optional, #75)", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.6 },
    );
    expect(verdict.passed).toBe(true);
  });

  it("skips an unset aggregate for a scorer the threshold DOES require, rather than treating it as a failing 0 (#75)", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.6, toolRouting: 0.9 },
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toHaveLength(0);
  });

  it("fails on toolRouting when both the threshold and the aggregate are present and the aggregate misses it (#75)", () => {
    const verdict = evaluateVerdict(
      { groundedness: 0.9, gapHonesty: 0.95, relevance: 0.6, toolRouting: 0.2 },
      { groundedness: 0.8, gapHonesty: 0.7, relevance: 0.6, toolRouting: 0.9 },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((line) => /tool routing/i.test(line))).toBe(true);
  });
});
