import { describe, expect, it } from "vitest";
import { evalCaseSchema, evalDatasetSchema } from "./schema.js";

const validCase = {
  id: "grounded-typescript-house-numbers",
  category: "grounded",
  question: "What has he built with TypeScript at House Numbers?",
  gapHonestyDirection: "claimed",
};

describe("evalCaseSchema", () => {
  it("accepts a well-formed grounded case", () => {
    expect(evalCaseSchema.safeParse(validCase).success).toBe(true);
  });

  it("rejects a case missing a question", () => {
    const { question, ...rest } = validCase;
    expect(evalCaseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, category: "unrelated" });
    expect(result.success).toBe(false);
  });

  it("rejects an id that isn't kebab-case", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, id: "Not Kebab Case" });
    expect(result.success).toBe(false);
  });

  it("rejects a grounded case whose direction is 'gap' (category/direction must agree)", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, gapHonestyDirection: "gap" });
    expect(result.success).toBe(false);
  });

  it("rejects a gap case whose direction is 'claimed'", () => {
    const result = evalCaseSchema.safeParse({
      ...validCase,
      category: "gap",
      gapHonestyDirection: "claimed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an off-topic case with direction 'n/a'", () => {
    const result = evalCaseSchema.safeParse({
      id: "off-topic-pizza",
      category: "off-topic",
      question: "What's your favorite pizza topping?",
      gapHonestyDirection: "n/a",
    });
    expect(result.success).toBe(true);
  });
});

describe("evalDatasetSchema", () => {
  it("accepts an array of valid, uniquely-id'd cases", () => {
    const other = { ...validCase, id: "grounded-aws-house-numbers" };
    expect(evalDatasetSchema.safeParse([validCase, other]).success).toBe(true);
  });

  it("rejects a dataset with duplicate ids", () => {
    const result = evalDatasetSchema.safeParse([validCase, validCase]);
    expect(result.success).toBe(false);
  });

  it("rejects a dataset containing one malformed case", () => {
    const malformed = { id: "broken", category: "grounded" };
    const result = evalDatasetSchema.safeParse([validCase, malformed]);
    expect(result.success).toBe(false);
  });
});
