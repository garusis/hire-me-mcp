import { describe, expect, it } from "vitest";
import {
  assertWithinBudget,
  BudgetExceededError,
  createBudgetGuard,
  estimateCostUsd,
  getModelPricing,
} from "./budget.js";

const config = { maxCases: 10, maxTotalTokens: 50_000, maxCostUsd: 0.5 };

describe("assertWithinBudget", () => {
  it("does not throw when usage is within every cap", () => {
    expect(() =>
      assertWithinBudget(config, { casesRun: 3, totalTokens: 1_000, costUsd: 0.01 }),
    ).not.toThrow();
  });

  it("throws BudgetExceededError with a clear message when the case cap would be exceeded", () => {
    expect(() => assertWithinBudget(config, { casesRun: 11, totalTokens: 0, costUsd: 0 })).toThrow(
      BudgetExceededError,
    );
    try {
      assertWithinBudget(config, { casesRun: 11, totalTokens: 0, costUsd: 0 });
    } catch (error) {
      expect((error as Error).message).toMatch(/case/i);
    }
  });

  it("throws BudgetExceededError with a clear message when the token cap would be exceeded", () => {
    try {
      assertWithinBudget(config, { casesRun: 1, totalTokens: 60_000, costUsd: 0 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceededError);
      expect((error as Error).message).toMatch(/token/i);
    }
  });

  it("throws BudgetExceededError with a clear message when the cost cap would be exceeded", () => {
    try {
      assertWithinBudget(config, { casesRun: 1, totalTokens: 0, costUsd: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceededError);
      expect((error as Error).message).toMatch(/cost|budget/i);
    }
  });
});

describe("estimateCostUsd", () => {
  it("computes cost from per-million-token pricing", () => {
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    );
    expect(cost).toBeCloseTo(0.1 + 0.2, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(
      estimateCostUsd({ inputTokens: 0, outputTokens: 0 }, getModelPricing("unknown-model")),
    ).toBe(0);
  });
});

describe("getModelPricing", () => {
  it("returns a documented fallback for an unrecognized model id rather than throwing", () => {
    expect(() => getModelPricing("some-future-model")).not.toThrow();
    const pricing = getModelPricing("some-future-model");
    expect(pricing.inputPerMillion).toBeGreaterThan(0);
    expect(pricing.outputPerMillion).toBeGreaterThan(0);
  });

  it("prices the default google model, gemini-3.5-flash-lite, as free tier ($0)", () => {
    const pricing = getModelPricing("gemini-3.5-flash-lite");
    expect(pricing.inputPerMillion).toBe(0);
    expect(pricing.outputPerMillion).toBe(0);
  });
});

/**
 * #307 second independent-review correction (2nd round), finding 2: budget
 * enforcement was case-level only — checked once per case, AFTER
 * `deps.runCase` fully returned. A multi-step case (model call -> tool call
 * -> another model call) could issue further real provider requests after
 * an earlier step already exhausted the known budget. `createBudgetGuard`
 * accumulates KNOWN usage across every request/case sharing one instance and
 * throws BEFORE the next request the instant either cap is already crossed
 * — the guard `./retry.ts`'s `beforeAttempt` hook and `./cli.ts`'s `main()`
 * wire together.
 */
describe("createBudgetGuard", () => {
  const pricing = { inputPerMillion: 1, outputPerMillion: 1 };

  it("does not throw before any usage is recorded, or while recorded usage stays within both caps", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 1_000, maxCostUsd: 1 });
    expect(() => guard.assertNotExceeded()).not.toThrow();

    guard.recordUsage({ inputTokens: 100, outputTokens: 100, totalTokens: 200 }, pricing);
    expect(() => guard.assertNotExceeded()).not.toThrow();
  });

  it("throws BudgetExceededError once accumulated KNOWN tokens cross maxTotalTokens — before the next request, not after", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 100, maxCostUsd: 100 });
    guard.recordUsage({ inputTokens: 60, outputTokens: 50, totalTokens: 110 }, pricing);

    expect(() => guard.assertNotExceeded()).toThrow(BudgetExceededError);
  });

  it("throws BudgetExceededError once accumulated KNOWN cost crosses maxCostUsd", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 1_000_000, maxCostUsd: 0.0001 });
    guard.recordUsage(
      { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 },
      { inputPerMillion: 1, outputPerMillion: 0 },
    );

    expect(() => guard.assertNotExceeded()).toThrow(BudgetExceededError);
  });

  it("accumulates usage across multiple recordUsage calls sharing one instance — proving cross-request/cross-case consumption is shared, not per-call", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 150, maxCostUsd: 100 });
    guard.recordUsage({ inputTokens: 50, outputTokens: 0, totalTokens: 50 }, pricing);
    expect(() => guard.assertNotExceeded()).not.toThrow();
    guard.recordUsage({ inputTokens: 50, outputTokens: 0, totalTokens: 50 }, pricing);
    expect(() => guard.assertNotExceeded()).not.toThrow();
    guard.recordUsage({ inputTokens: 51, outputTokens: 0, totalTokens: 51 }, pricing);

    expect(() => guard.assertNotExceeded()).toThrow(BudgetExceededError);
  });

  /**
   * #307 review issuecomment-5577656024: "Review exhausted budget equality
   * too: no additional request once known consumption equals its cap."
   * Previously `assertNotExceeded` used strict `>`, so known usage sitting
   * EXACTLY on the cap let one more real provider request through before the
   * guard ever fired — the cap is a ceiling to stop AT, not a threshold to
   * cross before stopping.
   */
  it("throws once accumulated KNOWN tokens EQUAL maxTotalTokens exactly — never lets one more request through at the exact cap", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 100, maxCostUsd: 100 });
    guard.recordUsage({ inputTokens: 60, outputTokens: 40, totalTokens: 100 }, pricing);

    expect(() => guard.assertNotExceeded()).toThrow(BudgetExceededError);
  });

  it("throws once accumulated KNOWN cost EQUALS maxCostUsd exactly", () => {
    const guard = createBudgetGuard({ maxTotalTokens: 1_000_000, maxCostUsd: 1 });
    guard.recordUsage(
      { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 },
      { inputPerMillion: 1, outputPerMillion: 0 },
    );

    expect(() => guard.assertNotExceeded()).toThrow(BudgetExceededError);
  });
});

/**
 * #307 review issuecomment-5577656024, finding 1: a `BudgetExceededError`
 * thrown mid-case (from `beforeAttempt`, before a request that would cross
 * the shared budget) must be able to carry the case's own known-usage
 * attempt trace, so `./runner.ts` can fold that KNOWN usage into totals
 * instead of losing it, and classify the case as aborted rather than
 * never-started. Previously this class had no such field at all.
 */
describe("BudgetExceededError attempts", () => {
  it("defaults to an empty attempts trace when none is supplied", () => {
    const error = new BudgetExceededError("stopped");
    expect(error.attempts).toEqual([]);
  });

  it("carries a supplied attempts trace", () => {
    const attempts = [
      {
        attempt: 1,
        outcome: "success" as const,
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    ];
    const error = new BudgetExceededError("stopped", attempts);
    expect(error.attempts).toEqual(attempts);
  });
});
