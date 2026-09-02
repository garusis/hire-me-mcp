import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "./budget.js";
import type { EvalCase } from "./dataset/schema.js";
import { runEvalSuite } from "./runner.js";

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

  it("aborts loudly with BudgetExceededError when the token budget is exceeded mid-run, without silently truncating", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
    });
    await expect(
      runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 250_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      ),
    ).rejects.toThrow(BudgetExceededError);

    // Aborted after the second case pushed cumulative tokens past the cap —
    // never reached the third.
    expect(runCase).toHaveBeenCalledTimes(2);
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
});
