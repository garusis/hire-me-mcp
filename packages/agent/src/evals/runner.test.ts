import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BudgetExceededError } from "./budget.js";
import { createCaseAttemptTracker, createEvalRetryPolicy, createRunCase } from "./cli.js";
import type { EvalCase } from "./dataset/schema.js";
import { createRetryingModel } from "./retry.js";
import { EvalCaseError, runEvalSuite, selectCasesForBudget } from "./runner.js";

function makeCase(overrides: Partial<EvalCase> & Pick<EvalCase, "id">): EvalCase {
  return {
    category: "grounded",
    question: `Question for ${overrides.id}`,
    gapHonestyDirection: "claimed",
    ...overrides,
  };
}

const groundedCase = makeCase({ id: "grounded-1" });
const gapCase = makeCase({ id: "gap-1", category: "gap", gapHonestyDirection: "gap" });
const offTopicCase = makeCase({
  id: "off-topic-1",
  category: "off-topic",
  gapHonestyDirection: "n/a",
});

function stubRunCase(answer = "He built things [cite:skill:aws].") {
  return vi.fn().mockResolvedValue({
    answer,
    toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  });
}

const ragCase = makeCase({
  id: "rag-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "search-career",
});
const exactFactCase = makeCase({
  id: "exact-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "deterministic-only",
});
const storyScopedCase = makeCase({
  id: "story-scoped-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "search-career-story-scoped",
});

describe("runEvalSuite", () => {
  it("runs every case up to the budget's case cap, scoring each with all applicable scorers", async () => {
    const runCase = stubRunCase();
    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(runCase).toHaveBeenCalledTimes(3);
    expect(report.cases).toHaveLength(3);
    // off-topic case has no gap-honesty direction — score is null
    const offTopicResult = report.cases.find((c) => c.id === "off-topic-1");
    expect(offTopicResult?.scores.gapHonesty).toBeNull();
    // grounded/gap cases do get a gap-honesty score
    const groundedResult = report.cases.find((c) => c.id === "grounded-1");
    expect(groundedResult?.scores.gapHonesty).not.toBeNull();
    expect(report.promptVersion).toBe("test-version");
    expect(report.modelId).toBe("gemini-3.6-flash");
  });

  it("never runs more cases than the budget's maxCases", async () => {
    const runCase = stubRunCase();
    await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 2, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(runCase).toHaveBeenCalledTimes(2);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 1): a naive `cases.slice(0, maxCases)` silently drops every
   * `story-manifest-*` case whenever the dataset appends them after the
   * base cases and the budget cap falls short of the combined total — the
   * exact real-world shape of `./dataset/cases.ts` (28 base cases then 38
   * `story-manifest-*` cases) under CI's then-current 25-case default cap
   * (raised to the full 66-case dataset size by a later #295 integration
   * correction). A budget-capped run must proportionally cover every
   * id-prefix group present in the dataset, not just whichever group
   * happens to sort first — this still matters below any cap smaller than
   * the dataset (e.g. a `workflow_dispatch` override), regardless of what
   * CI's own current default is.
   */
  it("proportionally covers every case-id-prefix group under a budget cap, instead of a naive prefix slice that can silently drop an entire group", async () => {
    const runCase = stubRunCase();
    const baseCases = Array.from({ length: 6 }, (_, i) => makeCase({ id: `base-${i}` }));
    const manifestCases = Array.from({ length: 6 }, (_, i) =>
      makeCase({ id: `story-manifest-${i}` }),
    );

    await runEvalSuite(
      {
        cases: [...baseCases, ...manifestCases],
        budget: { maxCases: 4, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const askedQuestions = runCase.mock.calls.map(([question]) => question as string);
    expect(askedQuestions.some((q) => q.includes("story-manifest-"))).toBe(true);
    expect(askedQuestions.some((q) => q.includes("base-"))).toBe(true);
  });

  it("exports selectCasesForBudget so the real dataset's default-run coverage can be regression-tested directly (#295 correction, finding 1/5)", () => {
    const cases = [
      ...Array.from({ length: 3 }, (_, i) => makeCase({ id: `base-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => makeCase({ id: `story-manifest-${i}` })),
    ];
    const selected = selectCasesForBudget(cases, 2);
    expect(selected).toHaveLength(2);
    expect(selected.some((c) => c.id.startsWith("story-manifest-"))).toBe(true);
  });

  /**
   * #307 second independent-review correction, finding 5: stopping on a
   * budget overage must still preserve every case that DID complete (and
   * its known usage) in a resolved, partial report — not reject the whole
   * run and lose it, the same "stop loudly, but never drop what already
   * ran" treatment `EvalCaseError` gets. See the dedicated "budget exceeded
   * preserves the partial report" suite below for the full report-shape
   * assertions.
   */
  it("stops after the token budget is exceeded mid-run, without silently truncating or continuing to spend", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
    });
    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 10, maxTotalTokens: 250_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    // Stopped after the second case pushed cumulative tokens past the cap —
    // never reached the third.
    expect(runCase).toHaveBeenCalledTimes(2);
    expect(report.complete).toBe(false);
    expect(report.verdict.passed).toBe(false);
  });

  it("does not throttle between cases itself — rate limiting lives at the model boundary (#282)", async () => {
    // Fake timers that are never advanced: if this runner still slept
    // between cases (the pre-#282 per-case throttle, which counted cases
    // rather than the 2-3 real requests each one makes), the awaited run
    // would hang here instead of completing.
    vi.useFakeTimers();
    try {
      const runCase = stubRunCase();

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(runCase).toHaveBeenCalledTimes(3);
      expect(report.cases).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scores answerAssertions when a case declares them, and leaves the score null otherwise (#300)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "The extraction work was a proof of concept; accuracy went from 30% to 87% [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const assertedCase = makeCase({
      id: "poc-1",
      answerAssertions: {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["30%\\s*to\\s*87%"],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [assertedCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const asserted = report.cases.find((c) => c.id === "poc-1");
    expect(asserted?.scores.answerAssertions?.score).toBe(0.5);
    const plain = report.cases.find((c) => c.id === "grounded-1");
    expect(plain?.scores.answerAssertions).toBeNull();
  });

  it("scores toolRouting when a case declares expectedToolCall, using the run's toolCalls (#75, #294)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: undefined }],
    });
    const report = await runEvalSuite(
      {
        cases: [ragCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const ragResult = report.cases.find((c) => c.id === "rag-1");
    expect(ragResult?.scores.toolRouting).toEqual({
      score: 1,
      reason: expect.stringContaining("search-career"),
    });
  });

  it("scores toolRouting 0 when a deterministic-only case's run actually called search-career (#75)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: undefined }],
    });
    const report = await runEvalSuite(
      {
        cases: [exactFactCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases.find((c) => c.id === "exact-1")?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 0 for a search-career-story-scoped case when the run's search-career call carries no sourceTypes (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: { query: "leadership" } }],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 for a search-career-story-scoped case when the run's search-career call carries sourceTypes: ['story'] (#294)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        { toolName: "search-career", args: { query: "leadership", sourceTypes: ["story"] } },
        { toolName: "list-career-stories", args: { id: "xogito-client-account-recovery" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("passes the run's answer into scoreToolRouting so an unlabeled fallback after an empty story-scoped search scores 0 (fourth #294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He led a related effort at Acme: [cite:experience:acme].",
      toolCitations: [{ entityType: "experience" as const, entityId: "acme" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "search-career",
          args: { query: "leadership", sourceTypes: ["story"] },
          citations: [],
        },
        { toolName: "search-career", args: { query: "leadership" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 when the run's answer honestly labels a fallback after an empty story-scoped search (fourth #294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "No direct story supports that behavior. The closest related evidence, not itself a behavioral event, is [cite:experience:acme].",
      toolCitations: [{ entityType: "experience" as const, entityId: "acme" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "search-career",
          args: { query: "leadership", sourceTypes: ["story"] },
          citations: [],
        },
        { toolName: "search-career", args: { query: "leadership" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("leaves toolRouting null when a case does not declare expectedToolCall — backward compatible", async () => {
    const runCase = stubRunCase();
    const report = await runEvalSuite(
      {
        cases: [groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting).toBeNull();
  });

  it("scores mustCiteEntity against the [cite:...] markers actually present in the answer text, not just that the text mentions the entity by name (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He rebuilt client trust at Xogito [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const citedCase = makeCase({
      id: "cited-1",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
        mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [citedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.answerAssertions?.score).toBe(1);
  });

  it("scores answerAssertions 0 when the answer text lacks the required citation marker, even though it names the entity in prose (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He rebuilt client trust at Xogito.",
      toolCitations: [{ entityType: "recommendation" as const, entityId: "some-other-rec" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const citedCase = makeCase({
      id: "cited-2",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [citedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.answerAssertions?.score).toBe(0);
  });

  /**
   * #294 independent-review correction (finding 2): a `list-career-stories`
   * case can declare `expectedCompetencies` — the located call's
   * `competencies` argument must contain every listed value AND the call
   * must precede any `search-career` call in the trace. Tool-name presence
   * alone (the pre-correction check) accepted an empty-args call or one
   * made after a `search-career` fallback.
   */
  it("scores toolRouting 0 for a list-career-stories case with expectedCompetencies when the located call's competencies argument omits the required value (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "list-career-stories", args: { competencies: ["ownership"] } }],
    });
    const competencyCase = makeCase({
      id: "competency-1",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 0 for a list-career-stories case when a search-career call precedes the list-career-stories call, even with a matching competency (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        { toolName: "search-career", args: { query: "leadership" } },
        { toolName: "list-career-stories", args: { competencies: ["leadership"] } },
      ],
    });
    const competencyCase = makeCase({
      id: "competency-2",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 for a list-career-stories case whose located call carries the required competency and precedes any search-career call (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "list-career-stories", args: { competencies: ["leadership"] } }],
    });
    const competencyCase = makeCase({
      id: "competency-3",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  /**
   * #307 second independent-review correction (finding 1): `scoreToolRouting`
   * needs the case's own acceptable story ids — derived from
   * `answerAssertions.mustCiteEntity`/`citationGroups`, the same derivation
   * `storyCompletenessRequirementOf` already computes for
   * `scoreStoryCompleteness` — to know whether an alternate-tool citation is
   * actually acceptable, not just cited. Without this wired through, the
   * either-route shortcut accepted ANY story a run happened to cite.
   */
  it("scores toolRouting 0 when the run's alternate-tool (list-career-stories) call cites a story that is NOT in the case's mustCiteEntity acceptable ids", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He did that. [cite:story:wrong-story]",
      toolCitations: [{ entityType: "story" as const, entityId: "wrong-story" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "list-career-stories",
          args: { competencies: ["leadership"] },
          citations: [{ entityType: "story", entityId: "wrong-story" }],
        },
      ],
    });
    const acceptableStoryCase = makeCase({
      id: "acceptable-story-1",
      expectedToolCall: "search-career-story-scoped",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "expected-story" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [acceptableStoryCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 when the run's alternate-tool (list-career-stories) call cites a story that IS in the case's mustCiteEntity acceptable ids", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He did that. [cite:story:expected-story]",
      toolCitations: [{ entityType: "story" as const, entityId: "expected-story" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "list-career-stories",
          args: { competencies: ["leadership"] },
          citations: [{ entityType: "story", entityId: "expected-story" }],
        },
      ],
    });
    const acceptableStoryCase = makeCase({
      id: "acceptable-story-2",
      expectedToolCall: "search-career-story-scoped",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "expected-story" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [acceptableStoryCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("treats a missing toolCalls field on the run result as an empty trace, not a crash (backward compatible with pre-#75 runCase stubs)", async () => {
    const runCase = stubRunCase(); // no toolCalls field at all
    const report = await runEvalSuite(
      {
        cases: [exactFactCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    // deterministic-only + empty trace = trivially satisfied
    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  /**
   * #307 track 2 (agent-eval observability): the diagnosis on #307 found
   * that `eval-report.json` kept only the final answer + scores, so a case
   * like `story-manifest-x08` (answered "no evidence" with an uncited
   * search) could not be told apart from "the story chunk was never in the
   * top results" versus "it was returned and the model ignored it" without
   * re-running against real state. `CaseReport.toolTrace` closes that gap by
   * carrying the run's own `toolCalls` (name, model-supplied args, and that
   * call's own returned citations, in call order — order IS the result
   * rank) straight onto the report, unmodified.
   */
  it("persists the run's tool-call trace (name, args, returned citations, in call order) onto CaseReport.toolTrace", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He led the incident response [cite:story:sap-incident].",
      toolCitations: [{ entityType: "story" as const, entityId: "sap-incident" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        { toolName: "list-career-stories", args: { competencies: ["leadership"] } },
        {
          toolName: "search-career",
          args: { query: "incident response", sourceTypes: ["story"] },
          citations: [
            { entityType: "story" as const, entityId: "sap-incident" },
            { entityType: "story" as const, entityId: "other-story" },
          ],
        },
      ],
    });

    const report = await runEvalSuite(
      {
        cases: [groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.toolTrace).toEqual([
      { toolName: "list-career-stories", args: { competencies: ["leadership"] } },
      {
        toolName: "search-career",
        args: { query: "incident response", sourceTypes: ["story"] },
        citations: [
          { entityType: "story", entityId: "sap-incident" },
          { entityType: "story", entityId: "other-story" },
        ],
      },
    ]);
  });

  it("defaults CaseReport.toolTrace to an empty array when the run result carries no toolCalls field", async () => {
    const runCase = stubRunCase(); // no toolCalls field at all
    const report = await runEvalSuite(
      {
        cases: [groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.toolTrace).toEqual([]);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 4): `runEvalSuite` must thread the run's actual `toolCitations`
   * into `scoreAnswerAssertions` so a `citationGroups` `preferredRef` check
   * only fails when the preferred source was really returned by a tool that
   * turn — not unconditionally whenever an honest alternative is cited.
   */
  it("passes the run's toolCitations through to the preferred-source check, so citing an honest alternative only fails when the preferred source was actually returned this turn", async () => {
    const preferredNotReturned = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [{ entityType: "story" as const, entityId: "mutual-informal-leadership" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const preferredCase = makeCase({
      id: "preferred-1",
      answerAssertions: {
        citationGroups: [
          {
            mode: "any",
            refs: [
              { entityType: "story", entityId: "xogito-client-account-recovery" },
              { entityType: "story", entityId: "mutual-informal-leadership" },
            ],
            preferredRef: { entityType: "story", entityId: "xogito-client-account-recovery" },
          },
        ],
      },
    });
    const reportWithoutPreferred = await runEvalSuite(
      {
        cases: [preferredCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase: preferredNotReturned },
    );
    expect(reportWithoutPreferred.cases[0]?.scores.answerAssertions?.score).toBe(1);

    const preferredReturned = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [
        { entityType: "story" as const, entityId: "xogito-client-account-recovery" },
        { entityType: "story" as const, entityId: "mutual-informal-leadership" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const reportWithPreferred = await runEvalSuite(
      {
        cases: [preferredCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase: preferredReturned },
    );
    expect(reportWithPreferred.cases[0]?.scores.answerAssertions?.score).toBe(0);
  });

  /**
   * #295 second independent-review correction (finding 4): `runEvalSuite`
   * must score `preferredSourceCompliance` independently
   * (`./scorers/answer-assertions.ts`'s `scorePreferredSourceCompliance`)
   * for any case declaring a `citationGroups.preferredRef`, and leave it
   * `null` for a case that declares no preference at all.
   */
  it("scores preferredSourceCompliance independently of answerAssertions, and leaves it null for a case with no declared preference", async () => {
    const preferredCase = makeCase({
      id: "preferred-2",
      answerAssertions: {
        citationGroups: [
          {
            mode: "any",
            refs: [
              { entityType: "story", entityId: "xogito-client-account-recovery" },
              { entityType: "story", entityId: "mutual-informal-leadership" },
            ],
            preferredRef: { entityType: "story", entityId: "xogito-client-account-recovery" },
          },
        ],
      },
    });
    const runCase = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [
        { entityType: "story" as const, entityId: "xogito-client-account-recovery" },
        { entityType: "story" as const, entityId: "mutual-informal-leadership" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [preferredCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const preferredReport = report.cases.find((c) => c.id === "preferred-2");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    expect(preferredReport?.scores.preferredSourceCompliance?.score).toBe(0);
    expect(plainReport?.scores.preferredSourceCompliance).toBeNull();
  });

  /**
   * #295 third-independent-review correction (finding 1): `runEvalSuite`
   * must score `factualBoundaryCompliance` independently
   * (`./scorers/answer-assertions.ts`'s `scoreFactualBoundaryCompliance`)
   * for any case declaring `mustMatch`/`mustNotMatch`/`conditionalMustMatch`,
   * as a BINARY pass/fail — not diluted by other passing assertions in the
   * same case — and leave it `null` for a case that declares none of those.
   */
  it("scores factualBoundaryCompliance independently and blocking, and leaves it null for a case with no text/caveat boundary declared", async () => {
    const boundaryCase = makeCase({
      id: "boundary-1",
      answerAssertions: {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["shipped to production"],
      },
    });
    const runCase = vi.fn().mockResolvedValue({
      answer: "This was shipped to production, not a proof of concept.",
      toolCitations: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [boundaryCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const boundaryReport = report.cases.find((c) => c.id === "boundary-1");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    // mustMatch holds (the answer does mention "proof of concept"), but
    // mustNotMatch is violated ("shipped to production") — one violation
    // out of two assertions must still fail this BINARY score outright
    // (0), not the diluted 0.5 scoreAnswerAssertions would report.
    expect(boundaryReport?.scores.factualBoundaryCompliance?.score).toBe(0);
    expect(plainReport?.scores.factualBoundaryCompliance).toBeNull();
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 2): `runEvalSuite` must score behavioral-story completeness
   * (`./scorers/story-completeness.ts`) for any case that declares a
   * citation-based `answerAssertions` (`mustCiteEntity`/`citationGroups` —
   * a case expecting a complete story, not a generic base-dataset check),
   * and leave it `null` for a case that doesn't.
   */
  it("scores storyCompleteness when a case declares citation-based answerAssertions, and leaves it null otherwise", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "After the project manager resigned, the client was deeply frustrated with progress. " +
        "Marcos increased the meeting cadence and delivered quick wins alongside the core repairs. " +
        "As a result, trust returned and the client later commissioned additional projects. " +
        "[cite:story:xogito-client-account-recovery]",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const storyCase = makeCase({
      id: "story-1",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [storyCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const storyReport = report.cases.find((c) => c.id === "story-1");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    expect(storyReport?.scores.storyCompleteness?.score).toBe(1);
    expect(plainReport?.scores.storyCompleteness).toBeNull();
  });

  /**
   * #295 third-independent-review correction, finding 3: a `citationGroups`
   * entry with `mode: "all"` (cross-cutting) must score story completeness
   * with `"all"` semantics — full coverage required for EVERY listed
   * story, not a best-of-one match — while an `"any"` group (or a plain
   * `mustCiteEntity`) still uses best-of-cited-and-acceptable semantics.
   */
  it("scores storyCompleteness with 'all' semantics for a cross-cutting citationGroups entry — a bare extra citation with no facts fails the case", async () => {
    const crossCuttingCase = makeCase({
      id: "cross-cutting-1",
      answerAssertions: {
        citationGroups: [
          {
            mode: "all",
            refs: [
              { entityType: "story", entityId: "fullstack-labs-sap-migration" },
              { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
            ],
          },
        ],
      },
    });
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "The legacy SAP financial calculations needed migrating. Marcos wrote ETL scripts to " +
        "handle rounding differences. The migration completed without data loss, drawing on " +
        "legacy-system experts. [cite:story:fullstack-labs-sap-migration] " +
        "[cite:story:house-numbers-secure-public-document-upload]",
      toolCitations: [
        { entityType: "story" as const, entityId: "fullstack-labs-sap-migration" },
        { entityType: "story" as const, entityId: "house-numbers-secure-public-document-upload" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [crossCuttingCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const crossCuttingReport = report.cases.find((c) => c.id === "cross-cutting-1");
    // SAP is fully narrated (score 1); the public-upload story is only
    // bare-cited with no facts (score 0) — "all" mode must take the WORST,
    // not the best, so the case-level score is 0, not 1.
    expect(crossCuttingReport?.scores.storyCompleteness?.score).toBe(0);
  });

  /**
   * #295 integration correction (independent review, finding 3): this
   * module's own doc comments described CI's default cap as 25 and the
   * cross-package ask to raise it as still unresolved, even after
   * `agent-evals.yml`/`release-readiness.yml` were raised to 66 elsewhere
   * in the same correction. Regression, not just a one-time prose fix, so
   * the doc comments can't silently drift stale again.
   */
  it("doesn't describe CI's default cap using the stale pre-#295 25-case figure (#295 integration correction, finding 3)", () => {
    const runnerSource = readFileSync(
      fileURLToPath(new URL("./runner.ts", import.meta.url)),
      "utf8",
    );
    expect(runnerSource).not.toMatch(/CI's current 25-case/);
  });

  /**
   * #307 C5 (retry/observability, Codex supervision correction): a terminal
   * provider failure — everything already retried by `./retry.ts`'s single
   * retry owner and still rejected — must stop the suite outright, not
   * continue to the next case. Completed cases and their known usage are
   * preserved; the failing case is recorded with its sanitized error and
   * attempt trace; every case that never got a turn is listed as
   * unexecuted; the run never regenerates an already-completed answer.
   */
  describe("terminal case failure stops the suite (#307 C5)", () => {
    it("stops after the failing case, recording it and every case after it as unexecuted", async () => {
      const thirdCase = makeCase({ id: "grounded-3" });
      const runCase = vi
        .fn()
        .mockResolvedValueOnce({
          answer: "He built things [cite:skill:aws].",
          toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        })
        .mockRejectedValueOnce(
          new EvalCaseError("Eval case failed: Service Unavailable", {
            statusCode: 503,
            errorName: "APICallError",
            errorMessage: "Service Unavailable",
            attempts: [
              { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
              { attempt: 2, outcome: "stopped-retries-exhausted", durationMs: 5, statusCode: 503 },
            ],
          }),
        );

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, thirdCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      // Never called a third time — no continuing the suite past the failure.
      expect(runCase).toHaveBeenCalledTimes(2);
      // The one case that DID complete is preserved, fully scored.
      expect(report.cases).toHaveLength(1);
      expect(report.cases[0]?.id).toBe("grounded-1");
      expect(report.totals.totalTokens).toBe(150);

      expect(report.failedCases).toHaveLength(1);
      expect(report.failedCases[0]).toMatchObject({
        id: "gap-1",
        statusCode: 503,
        errorMessage: "Service Unavailable",
      });
      expect(report.failedCases[0]?.attempts).toHaveLength(2);

      expect(report.unexecutedCaseIds).toEqual(["grounded-3"]);
      expect(report.complete).toBe(false);
      expect(report.verdict.passed).toBe(false);
    });

    it("does not throw — a terminal case failure resolves to a partial, failing report rather than rejecting the whole run", async () => {
      const runCase = vi.fn().mockRejectedValueOnce(
        new EvalCaseError("Eval case failed: quota exceeded", {
          statusCode: 429,
          errorMessage: "quota exceeded",
          attempts: [
            { attempt: 1, outcome: "stopped-rate-limited", durationMs: 5, statusCode: 429 },
          ],
        }),
      );

      await expect(
        runEvalSuite(
          {
            cases: [groundedCase],
            budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
            promptVersion: "test-version",
            modelId: "gemini-3.6-flash",
          },
          { runCase },
        ),
      ).resolves.toMatchObject({ complete: false });
    });

    it("still enforces the budget cap normally — an EvalCaseError doesn't interfere with the budget stopping the suite", async () => {
      const runCase = vi.fn().mockResolvedValue({
        answer: "He built things [cite:skill:aws].",
        toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
        usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
      });
      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase],
          budget: { maxCases: 10, maxTotalTokens: 100_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(report.complete).toBe(false);
      expect(report.budgetExceeded).not.toBeNull();
    });

    /**
     * #307 second independent-review correction, finding 4: a case's own
     * attempt trace (from `./retry.ts`'s `onAttempt`, threaded through
     * `RunnerDeps.runCase`'s result) must persist onto `CaseReport` for a
     * SUCCESSFUL case too, not just a failed one.
     */
    it("persists a successful case's own attempt trace onto CaseReport.attempts", async () => {
      const runCase = vi.fn().mockResolvedValue({
        answer: "He built things [cite:skill:aws].",
        toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        attempts: [
          { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
          { attempt: 2, outcome: "success", durationMs: 5 },
        ],
      });
      const report = await runEvalSuite(
        {
          cases: [groundedCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(report.cases[0]?.attempts).toEqual([
        { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
        { attempt: 2, outcome: "success", durationMs: 5 },
      ]);
    });

    /**
     * #307 second independent-review correction (2nd round), finding 3:
     * `scoreCase` previously dropped `run.usageKnown` — it never reached
     * `CaseReport`, so a report consumer couldn't tell a genuine zero-token
     * answer from "we don't actually know."
     */
    it("threads usageKnown from the run result onto CaseReport, feeding totals.usageComplete", async () => {
      const runCase = vi.fn().mockResolvedValue({
        answer: "He built things [cite:skill:aws].",
        toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        usageKnown: false,
      });
      const report = await runEvalSuite(
        {
          cases: [groundedCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(report.cases[0]?.usageKnown).toBe(false);
      expect(report.totals.usageComplete).toBe(false);
    });

    it("defaults CaseReport.usageKnown to true when the run result carries no explicit flag", async () => {
      const report = await runEvalSuite(
        {
          cases: [groundedCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase: stubRunCase() },
      );

      expect(report.cases[0]?.usageKnown).toBe(true);
      expect(report.totals.usageComplete).toBe(true);
    });

    it("defaults CaseReport.attempts to an empty array when the run result carries none", async () => {
      const report = await runEvalSuite(
        {
          cases: [groundedCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase: stubRunCase() },
      );

      expect(report.cases[0]?.attempts).toEqual([]);
    });

    /**
     * #307 second independent-review correction, finding 4: a case that
     * fails terminally can still have spent real, KNOWN tokens on earlier
     * successful attempts within the same request (or earlier steps of the
     * same `agent.generate()` turn) before the terminal rejection — that
     * usage must be added to the report's totals, not silently discarded
     * just because the case itself never produced a scored answer.
     */
    it("adds a failed case's known partial usage (from its attempt trace) to the report totals, instead of discarding it", async () => {
      const runCase = vi
        .fn()
        .mockResolvedValueOnce({
          answer: "He built things [cite:skill:aws].",
          toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        })
        .mockRejectedValueOnce(
          new EvalCaseError("Eval case failed: Service Unavailable", {
            statusCode: 503,
            errorMessage: "Service Unavailable",
            attempts: [
              {
                attempt: 1,
                outcome: "success",
                durationMs: 5,
                usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
              },
              { attempt: 2, outcome: "stopped-retries-exhausted", durationMs: 5, statusCode: 503 },
            ],
          }),
        );

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      // 150 from the completed case + 50 known from the failed case's own
      // successful attempt — never just the 150 from completed cases alone.
      expect(report.totals.totalTokens).toBe(200);
    });

    /**
     * #307 second independent-review correction (2nd round), finding 2: a
     * `BudgetExceededError` can now be thrown from INSIDE `deps.runCase`
     * itself (`./retry.ts`'s `beforeAttempt` hook stopping a request before
     * it's issued, mid-case) — distinct from an `EvalCaseError` (a case's
     * provider call failing) and from the EXISTING after-case
     * `assertWithinBudget` check below. It must resolve to a partial report
     * (never reject), preserving every case that DID fully complete, never
     * double-counting the aborted case's own (unknowable) usage, and
     * marking the aborted case itself — not just the ones after it — as
     * unexecuted.
     */
    it("resolves to a partial report when deps.runCase itself rejects with BudgetExceededError, marking the aborted case (and every case after it) unexecuted without double-counting", async () => {
      const budgetError = new BudgetExceededError("Eval token budget exceeded: stopping.");
      const runCase = vi
        .fn()
        .mockResolvedValueOnce({
          answer: "He built things [cite:skill:aws].",
          toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        })
        .mockRejectedValueOnce(budgetError);

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      // Never called for the case after the budget-aborted one.
      expect(runCase).toHaveBeenCalledTimes(2);
      // The one case that DID complete is preserved, with its usage intact.
      expect(report.cases).toHaveLength(1);
      expect(report.cases[0]?.id).toBe("grounded-1");
      expect(report.totals.totalTokens).toBe(150); // never guesses at the aborted case's usage
      expect(report.failedCases).toEqual([]); // this is a budget stop, not a case failure
      expect(report.unexecutedCaseIds).toEqual(["gap-1", "off-topic-1"]);
      expect(report.complete).toBe(false);
      expect(report.budgetExceeded).toEqual({ message: budgetError.message });
      expect(report.verdict.passed).toBe(false);
    });

    /**
     * #307 review issuecomment-5577656024, finding 1: the reviewer's own
     * offline reproduction — a case's first request succeeds with KNOWN
     * usage (150 tokens), then a second request within the SAME case is
     * blocked by the shared budget guard before it's issued
     * (`BudgetExceededError` carrying that case's own known-usage attempt
     * trace, per `./cli.ts`'s `createRunCase` fix). The persisted report
     * must carry that known 150 tokens into `totals` exactly once, classify
     * the case as aborted mid-flight (`partialCases`, not conflated with
     * `unexecutedCaseIds`), and preserve fail/partial semantics (never
     * pretend the run completed).
     */
    it("folds a mid-case BudgetExceededError's own KNOWN attempt usage into totals exactly once, and classifies the aborted case in partialCases — not unexecutedCaseIds", async () => {
      const knownAttempts = [
        {
          attempt: 1,
          outcome: "success" as const,
          durationMs: 5,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        },
        { attempt: 1, outcome: "stopped-budget-exceeded" as const, durationMs: 0 },
      ];
      const budgetError = new BudgetExceededError(
        "Eval token budget exceeded: stopping.",
        knownAttempts,
      );
      const runCase = vi.fn().mockRejectedValueOnce(budgetError);

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(runCase).toHaveBeenCalledTimes(1);
      expect(report.cases).toHaveLength(0);
      // The known 150 tokens from the aborted case's own first attempt are
      // in totals exactly once — never lost, never doubled.
      expect(report.totals.totalTokens).toBe(150);
      expect(report.totals.usageComplete).toBe(false);
      expect(report.failedCases).toEqual([]);
      // The aborted case itself is NOT in unexecutedCaseIds — it started and
      // made real progress, distinct from the cases after it that never ran.
      expect(report.unexecutedCaseIds).toEqual(["gap-1", "off-topic-1"]);
      expect(report.partialCases).toEqual([
        {
          id: "grounded-1",
          category: "grounded",
          question: groundedCase.question,
          attempts: knownAttempts,
        },
      ]);
      expect(report.complete).toBe(false);
      expect(report.verdict.passed).toBe(false);
    });

    /**
     * A stop before ANY request in a case (an empty attempts trace) must
     * remain distinguishable from a mid-case abort — it stays a plain
     * unexecuted case, not a `partialCases` entry, since there is no known
     * usage to fold in and the case never actually started.
     */
    it("keeps a budget stop with an EMPTY attempts trace as a plain unexecuted case, never a partialCases entry", async () => {
      const budgetError = new BudgetExceededError("Eval token budget exceeded: stopping.", []);
      const runCase = vi.fn().mockRejectedValueOnce(budgetError);

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(report.totals.totalTokens).toBe(0);
      expect(report.partialCases).toEqual([]);
      expect(report.unexecutedCaseIds).toEqual(["grounded-1", "gap-1"]);
    });
  });

  /**
   * #307 second independent-review correction, finding 5: a budget overage
   * must never lose the report the suite already built — `BudgetExceededError`
   * previously propagated straight out of `runEvalSuite`, so `./cli.ts`'s
   * `main()` never reached its `writeFile` call and every completed case's
   * work was lost. The suite must instead resolve to a partial, failing
   * report — same "preserve what ran, mark it incomplete, fail the verdict"
   * treatment `EvalCaseError` already gets.
   */
  describe("budget exceeded preserves the partial report (#307 second correction, finding 5)", () => {
    it("resolves to a partial report (never rejects) when the token budget is exceeded mid-run, preserving completed cases and their totals", async () => {
      const runCase = vi.fn().mockResolvedValue({
        answer: "He built things [cite:skill:aws].",
        toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
        usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
      });

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 250_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      // Both cases that ran ARE preserved (the second is what crossed the
      // cap) — never truncated to zero just because the run stopped.
      expect(runCase).toHaveBeenCalledTimes(2);
      expect(report.cases).toHaveLength(2);
      expect(report.totals.totalTokens).toBe(400_000);
      expect(report.unexecutedCaseIds).toEqual(["off-topic-1"]);
      expect(report.complete).toBe(false);
      expect(report.verdict.passed).toBe(false);
      expect(report.budgetExceeded?.message).toMatch(/token budget exceeded/i);
    });

    it("marks the run's own thrown BudgetExceededError as the stop reason, distinguishable from a terminal provider failure", async () => {
      const runCase = vi.fn().mockResolvedValue({
        answer: "He built things [cite:skill:aws].",
        toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
        usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 },
      });

      const report = await runEvalSuite(
        {
          cases: [groundedCase],
          budget: { maxCases: 10, maxTotalTokens: 500, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(report.budgetExceeded).not.toBeNull();
      expect(report.failedCases).toEqual([]);
    });
  });
});

/**
 * #307 review issuecomment-5577656024: "Required durable verification:
 * exercise the actual installed Mastra Agent with a fake multi-step provider
 * through the production wiring and report path, not only sequential
 * policy.run mocks." Every other budget/usage test in this file (and in
 * `cli.test.ts`) either injects a fake `deps.runCase` directly or drives
 * `./retry.ts`'s `RetryPolicy.run()` sequentially by hand — neither proves
 * the REAL composition `./cli.ts`'s `main()` builds actually behaves this
 * way: a real `@mastra/core` `Agent` (with a real tool, so it genuinely
 * issues a SECOND provider request mid-case after the first requests a tool
 * call) wrapped by `createRetryingModel`, fed through `createEvalRetryPolicy`
 * (the exact shared budget guard + attempt tracker wiring `main()` uses), and
 * `createRunCase` (the exact `RunnerDeps.runCase` `main()` passes to
 * `runEvalSuite`).
 */
describe("durable verification with a real Mastra Agent + fake multi-step provider (#307 review issuecomment-5577656024)", () => {
  function fakeTool() {
    return createTool({
      id: "fake-tool",
      description: "test tool",
      inputSchema: z.object({}).strict(),
      execute: async () => ({ ok: true }),
    });
  }

  function toolCallStep(inputTokens: number, outputTokens: number) {
    return {
      content: [
        { type: "tool-call" as const, toolCallId: "call-1", toolName: "fake-tool", input: "{}" },
      ],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: inputTokens,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
      },
      warnings: [],
    };
  }

  function textStep(text: string, inputTokens: number, outputTokens: number) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: inputTokens,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
      },
      warnings: [],
    };
  }

  /** Build the exact production composition `./cli.ts`'s `main()` builds, around a fake `doGenerate`. */
  function buildProductionWiring(
    doGenerate: () => Promise<unknown>,
    budget: { maxTotalTokens: number; maxCostUsd: number },
  ) {
    const attemptTracker = createCaseAttemptTracker();
    const retryPolicy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: budget.maxTotalTokens,
      maxCostUsd: budget.maxCostUsd,
      attemptTracker,
    });
    const inner = new MockLanguageModelV4({ doGenerate: doGenerate as never });
    const model = createRetryingModel({ model: inner, retryPolicy });
    const agent = new Agent({
      id: "test-agent",
      name: "Test Agent",
      instructions: "test",
      model,
      tools: { "fake-tool": fakeTool() },
    });
    return { runCase: createRunCase(agent, attemptTracker) };
  }

  it("stops a case MID-FLIGHT when its own 2nd real provider request would cross the token budget, retains the per-attempt trace, folds the known 150 tokens into totals exactly once, and produces a JSON-serializable report", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      if (calls === 1) return toolCallStep(100, 50); // known 150 tokens
      throw new Error("must never be called — the 2nd request must be blocked before dispatch");
    };
    const { runCase } = buildProductionWiring(doGenerate, { maxTotalTokens: 100, maxCostUsd: 100 });

    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    // Exactly ONE real provider request — the 2nd was stopped before dispatch.
    expect(calls).toBe(1);
    expect(report.totals.totalTokens).toBe(150);
    expect(report.partialCases).toHaveLength(1);
    expect(report.partialCases[0]?.id).toBe("grounded-1");
    expect(report.partialCases[0]?.attempts.map((a) => a.outcome)).toEqual([
      "success",
      "stopped-budget-exceeded",
    ]);
    expect(report.unexecutedCaseIds).toEqual(["gap-1"]);
    expect(report.complete).toBe(false);
    // The exact "persisted JSON" step `./cli.ts`'s `main()` performs — must
    // never throw (no non-serializable values) and must round-trip the
    // totals/partialCases this test just asserted on.
    const persisted = JSON.parse(JSON.stringify(report));
    expect(persisted.totals.totalTokens).toBe(150);
    expect(persisted.partialCases[0].id).toBe("grounded-1");
  });

  it("stops CROSS-CASE before the next case's own first request when the shared budget is already exhausted, never losing the completed case's known usage", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      return textStep(`answer ${calls}`, 100, 50); // 150 known tokens per case
    };
    const { runCase } = buildProductionWiring(doGenerate, { maxTotalTokens: 150, maxCostUsd: 100 });

    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    // The 1st case's own request went through (150 known tokens); the 2nd
    // case's FIRST request never dispatched at all.
    expect(calls).toBe(1);
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]?.id).toBe("grounded-1");
    expect(report.totals.totalTokens).toBe(150);
    // A stop before any request in the next case is a plain unexecuted case,
    // never a partialCases entry — it never actually started.
    expect(report.partialCases).toEqual([]);
    expect(report.unexecutedCaseIds).toEqual(["gap-1"]);
  });

  it("persists a partial-known successful case (mixed known/unknown attempt usage, no reported totalUsage) with its known partial sum, never a fabricated zero", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      if (calls === 1) return toolCallStep(100, 50); // known 150 tokens
      // 2nd step succeeds but this fake provider result carries no usage
      // AI SDK can parse (`extractDoGenerateUsage` falls back to "unknown").
      return {
        content: [{ type: "text" as const, text: "final answer" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        warnings: [],
      };
    };
    const { runCase } = buildProductionWiring(doGenerate, {
      maxTotalTokens: 1_000_000,
      maxCostUsd: 100,
    });

    const report = await runEvalSuite(
      {
        cases: [groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(calls).toBe(2);
    expect(report.cases).toHaveLength(1);
    // The known 150 tokens from the 1st (successful) step are preserved as
    // the case's own usage and folded into totals — never zeroed out just
    // because the 2nd step's usage couldn't be read.
    expect(report.cases[0]?.usageKnown).toBe(false);
    expect(report.totals.totalTokens).toBe(150);
    expect(report.totals.usageComplete).toBe(false);

    const persisted = JSON.parse(JSON.stringify(report));
    expect(persisted.cases[0].usageKnown).toBe(false);
    expect(persisted.totals.totalTokens).toBe(150);
  });
});
