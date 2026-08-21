import { describe, expect, it } from "vitest";
import {
  assertWithinBudget,
  BudgetExceededError,
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
