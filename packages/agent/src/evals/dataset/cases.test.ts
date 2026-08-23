import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./cases.js";
import { evalDatasetSchema } from "./schema.js";

describe("EVAL_CASES", () => {
  it("validates against the dataset schema", () => {
    const result = evalDatasetSchema.safeParse(EVAL_CASES);
    expect(result.success).toBe(true);
  });

  it("has at least two cases in every category", () => {
    const counts = new Map<string, number>();
    for (const evalCase of EVAL_CASES) {
      counts.set(evalCase.category, (counts.get(evalCase.category) ?? 0) + 1);
    }
    for (const category of ["grounded", "gap", "off-topic", "injection"]) {
      expect(counts.get(category) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("has unique ids", () => {
    const ids = EVAL_CASES.map((evalCase) => evalCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes at least three fuzzy/cross-cutting cases expecting search-career to be called (#75)", () => {
    const ragCases = EVAL_CASES.filter((c) => c.expectedToolCall === "search-career");
    expect(ragCases.length).toBeGreaterThanOrEqual(3);
  });

  it("includes at least one absent-topic gap case expecting search-career to be called (#75)", () => {
    const ragGapCases = EVAL_CASES.filter(
      (c) => c.category === "gap" && c.expectedToolCall === "search-career",
    );
    expect(ragGapCases.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one exact-fact case expecting deterministic-only routing (#75)", () => {
    const exactCases = EVAL_CASES.filter((c) => c.expectedToolCall === "deterministic-only");
    expect(exactCases.length).toBeGreaterThanOrEqual(1);
  });

  it("carries no private personal data (no email addresses or phone-like digit runs)", () => {
    for (const evalCase of EVAL_CASES) {
      const text = `${evalCase.question} ${evalCase.notes ?? ""}`;
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    }
  });
});
