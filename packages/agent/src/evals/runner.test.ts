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

describe("runEvalSuite", () => {
  it("runs every case up to the budget's case cap, scoring each with all applicable scorers", async () => {
    const runCase = stubRunCase();
    const sleep = vi.fn().mockResolvedValue(undefined);

    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase, sleep },
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
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 2, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase, sleep },
    );

    expect(runCase).toHaveBeenCalledTimes(2);
  });

  it("aborts loudly with BudgetExceededError when the token budget is exceeded mid-run, without silently truncating", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 250_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase, sleep },
      ),
    ).rejects.toThrow(BudgetExceededError);

    // Aborted after the second case pushed cumulative tokens past the cap —
    // never reached the third.
    expect(runCase).toHaveBeenCalledTimes(2);
  });

  it("throttles between calls via the injected sleep, never using real timers", async () => {
    const runCase = stubRunCase();
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runEvalSuite(
      {
        cases: [groundedCase, gapCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
        rpmLimit: 10,
      },
      { runCase, sleep },
    );

    // At least one throttle sleep between the two calls.
    expect(sleep).toHaveBeenCalled();
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });
});
