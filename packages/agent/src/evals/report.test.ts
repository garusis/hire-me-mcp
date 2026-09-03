import { describe, expect, it } from "vitest";
import { buildReport, type CaseReport } from "./report.js";

const baseCases = [
  {
    id: "grounded-1",
    category: "grounded" as const,
    question: "What has he built with AWS?",
    answer: "He built things with AWS [cite:skill:aws].",
    scores: {
      groundedness: { score: 1, reason: "fully cited" },
      gapHonesty: { score: 1, reason: "engaged, no refusal" },
      relevance: { score: 0.9, reason: "addresses AWS" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    },
  },
  {
    id: "gap-1",
    category: "gap" as const,
    question: "Does he have Rust experience?",
    answer:
      "He hasn't done production Rust work; closest evidence is TypeScript [cite:skill:typescript].",
    scores: {
      groundedness: { score: 1, reason: "cited closest evidence" },
      gapHonesty: { score: 0.8, reason: "states gap, cites evidence" },
      relevance: { score: 0.8, reason: "addresses Rust" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    },
  },
  {
    id: "off-topic-1",
    category: "off-topic" as const,
    question: "What's your favorite pizza topping?",
    answer: "I can only answer questions about his professional background.",
    scores: {
      groundedness: { score: 1, reason: "no fabricated claims" },
      gapHonesty: null,
      relevance: { score: 0.1, reason: "does not address pizza" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    },
  },
];

const totals = { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, costUsd: 0 };

describe("buildReport", () => {
  it("computes per-scorer aggregates as means over applicable cases", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.groundedness.mean).toBeCloseTo(1, 6);
    expect(report.aggregates.groundedness.count).toBe(3);
    // gapHonesty only applicable to the two cases that have a non-null score
    expect(report.aggregates.gapHonesty.mean).toBeCloseTo(0.9, 6);
    expect(report.aggregates.gapHonesty.count).toBe(2);
    expect(report.aggregates.relevance.count).toBe(3);
  });

  it("carries promptVersion, modelId, and totals through unmodified", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });
    expect(report.promptVersion).toBe("test-version");
    expect(report.modelId).toBe("gemini-3.6-flash");
    expect(report.totals).toEqual({ cases: 3, ...totals });
  });

  it("produces a passing verdict when every aggregate clears its threshold", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.05 },
    });
    expect(report.verdict.passed).toBe(true);
  });

  it("produces a failing verdict when an aggregate falls below its threshold", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.95 },
    });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /relevance/i.test(line))).toBe(true);
  });

  it("aggregates answerAssertions as 0-count/0-mean and never fails the verdict on it when no case declared assertions (#300)", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.answerAssertions).toEqual({ mean: 0, count: 0 });
    expect(report.verdict.failures.some((line) => /answer assertions/i.test(line))).toBe(false);
  });

  it("includes answerAssertions in the aggregate and the verdict once at least one case scored it (#300)", () => {
    const casesWithAssertions = [
      ...baseCases.slice(0, 2),
      {
        ...baseCases[2],
        scores: { ...baseCases[2]?.scores, answerAssertions: { score: 0.5, reason: "half" } },
      },
    ];

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: casesWithAssertions as typeof baseCases,
      totals,
      thresholds: { groundedness: 0, gapHonesty: 0, relevance: 0, answerAssertions: 0.9 },
    });

    expect(report.aggregates.answerAssertions).toEqual({ mean: 0.5, count: 1 });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /answer assertions/i.test(line))).toBe(true);
  });

  it("aggregates toolRouting as 0-count/0-mean and never fails the verdict on it when no case declared expectedToolCall (#75)", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.toolRouting).toEqual({ mean: 0, count: 0 });
    expect(report.verdict.failures.some((line) => /tool routing/i.test(line))).toBe(false);
  });

  it("includes toolRouting in the aggregate and the verdict once at least one case scored it (#75)", () => {
    const casesWithRouting = [
      ...baseCases.slice(0, 2),
      {
        ...baseCases[2],
        scores: { ...baseCases[2]?.scores, toolRouting: { score: 0.5, reason: "half" } },
      },
    ];

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: casesWithRouting as typeof baseCases,
      totals,
      thresholds: { groundedness: 0, gapHonesty: 0, relevance: 0, toolRouting: 0.9 },
    });

    expect(report.aggregates.toolRouting).toEqual({ mean: 0.5, count: 1 });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /tool routing/i.test(line))).toBe(true);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 2): `storyCompleteness` (`./scorers/story-completeness.ts`)
   * gets the same optional, zero-count-skips-verdict treatment as
   * `answerAssertions`/`toolRouting` above — most of the base dataset
   * doesn't declare a behavioral-story completeness expectation.
   */
  it("aggregates storyCompleteness as 0-count/0-mean and never fails the verdict on it when no case scored it (#295)", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.storyCompleteness).toEqual({ mean: 0, count: 0 });
    expect(report.verdict.failures.some((line) => /story completeness/i.test(line))).toBe(false);
  });

  it("includes storyCompleteness in the aggregate and the verdict once at least one case scored it (#295)", () => {
    const casesWithCompleteness = [
      ...baseCases.slice(0, 2),
      {
        ...baseCases[2],
        scores: { ...baseCases[2]?.scores, storyCompleteness: { score: 0.5, reason: "half" } },
      },
    ];

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: casesWithCompleteness as typeof baseCases,
      totals,
      thresholds: { groundedness: 0, gapHonesty: 0, relevance: 0, storyCompleteness: 0.9 },
    });

    expect(report.aggregates.storyCompleteness).toEqual({ mean: 0.5, count: 1 });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /story completeness/i.test(line))).toBe(true);
  });

  /**
   * #295 second independent-review correction (finding 4): a declared
   * preference is a locked per-case contract, not a statistical target — a
   * SINGLE failed preferred-source case must block the verdict on its own,
   * exactly like the retrieval package's own `preferredSourceCompliance`
   * fix. Same optional, zero-count-skips-verdict treatment as
   * `answerAssertions`/`toolRouting`/`storyCompleteness` when no case
   * declares a preference at all.
   */
  it("aggregates preferredSourceCompliance as 0-count/0-mean and never fails the verdict on it when no case scored it (#295)", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.preferredSourceCompliance).toEqual({ mean: 0, count: 0 });
    expect(report.verdict.failures.some((line) => /preferred.source/i.test(line))).toBe(false);
  });

  it("blocks the verdict when even one case's declared preference failed, despite four other passing preference cases averaging above a lenient threshold (#295)", () => {
    const passingPreference = { score: 1, reason: "complied" };
    const failingPreference = { score: 0, reason: "preferred source was returned but not cited" };
    const emptyScores: CaseReport["scores"] = {
      groundedness: { score: 1, reason: "n/a" },
      gapHonesty: null,
      relevance: { score: 1, reason: "n/a" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    };
    const casesWithPreferences: CaseReport[] = [
      "preference-1",
      "preference-2",
      "preference-3",
      "preference-4",
    ].map((id) => ({
      id,
      category: "grounded",
      question: `question for ${id}`,
      answer: "answer",
      scores: { ...emptyScores, preferredSourceCompliance: passingPreference },
    }));
    casesWithPreferences.push({
      id: "preference-5-failing",
      category: "grounded",
      question: "question for preference-5-failing",
      answer: "answer",
      scores: { ...emptyScores, preferredSourceCompliance: failingPreference },
    });

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: casesWithPreferences,
      totals,
      thresholds: { groundedness: 0, gapHonesty: 0, relevance: 0, preferredSourceCompliance: 1 },
    });

    // 4/5 compliant is 0.8 — well above a lenient 0.7 threshold, but the
    // committed default is blocking (1.0): the report must fail.
    expect(report.aggregates.preferredSourceCompliance).toEqual({ mean: 0.8, count: 5 });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /preferred.source/i.test(line))).toBe(true);
  });

  /**
   * #295 fourth independent-review correction, finding 2: "The runner test
   * titled 'blocking' only checks the per-case scorer value; it would
   * remain green if the threshold were lowered/removed or the aggregate
   * stopped gating the verdict." Same durable end-to-end pattern already
   * used for `preferredSourceCompliance` above — a declared factual
   * boundary is a locked per-case contract, not a statistical target.
   */
  it("aggregates factualBoundaryCompliance as 0-count/0-mean and never fails the verdict on it when no case scored it (#295)", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: baseCases,
      totals,
    });

    expect(report.aggregates.factualBoundaryCompliance).toEqual({ mean: 0, count: 0 });
    expect(report.verdict.failures.some((line) => /factual.boundary/i.test(line))).toBe(false);
  });

  it("blocks the verdict when even one case's factual-boundary check failed, despite four other passing cases averaging above a lenient threshold (#295)", () => {
    const passingBoundary = { score: 1, reason: "held" };
    const failingBoundary = { score: 0, reason: "missing required caveat" };
    const emptyScores: CaseReport["scores"] = {
      groundedness: { score: 1, reason: "n/a" },
      gapHonesty: null,
      relevance: { score: 1, reason: "n/a" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    };
    const casesWithBoundaries: CaseReport[] = [
      "boundary-1",
      "boundary-2",
      "boundary-3",
      "boundary-4",
    ].map((id) => ({
      id,
      category: "grounded",
      question: `question for ${id}`,
      answer: "answer",
      scores: { ...emptyScores, factualBoundaryCompliance: passingBoundary },
    }));
    casesWithBoundaries.push({
      id: "boundary-5-failing",
      category: "grounded",
      question: "question for boundary-5-failing",
      answer: "answer",
      scores: { ...emptyScores, factualBoundaryCompliance: failingBoundary },
    });

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: casesWithBoundaries,
      totals,
      thresholds: { groundedness: 0, gapHonesty: 0, relevance: 0, factualBoundaryCompliance: 1 },
    });

    // 4/5 compliant is 0.8 — well above a lenient 0.7 threshold, but the
    // committed default is blocking (1.0): the report must fail.
    expect(report.aggregates.factualBoundaryCompliance).toEqual({ mean: 0.8, count: 5 });
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.some((line) => /factual.boundary/i.test(line))).toBe(true);
  });

  /**
   * #307 track 2 (agent-eval observability): a case's `toolTrace` (name,
   * args, returned citations, in call order — the compact per-case trace
   * that distinguishes a retrieval failure from the model ignoring a
   * returned result) must survive assembly into the final report unmodified
   * when present, and default to an empty array (never `undefined`) when a
   * case carries none — the same default `runEvalSuite` applies for a run
   * result with no `toolCalls` field (`./runner.ts`), so every case in a
   * report has a consistently-typed `toolTrace: ToolCall[]`.
   */
  it("carries each case's toolTrace through to the report, defaulting to [] when a case declares none", () => {
    const caseWithTrace: CaseReport = {
      ...(baseCases[0] as CaseReport),
      toolTrace: [
        { toolName: "list-career-stories", args: { competencies: ["ownership"] } },
        {
          toolName: "search-career",
          args: { query: "ownership", sourceTypes: ["story"] },
          citations: [{ entityType: "story", entityId: "sap-incident" }],
        },
      ],
    };

    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [caseWithTrace, baseCases[1] as CaseReport],
      totals,
    });

    expect(report.cases[0]?.toolTrace).toEqual(caseWithTrace.toolTrace);
    expect(report.cases[1]?.toolTrace).toEqual([]);
  });
});
