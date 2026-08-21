import { describe, expect, it } from "vitest";
import { EVAL_CASES, evalCaseSchema, evalDatasetSchema } from "./index.js";

describe("dataset barrel", () => {
  it("re-exports the dataset and its schemas", () => {
    expect(Array.isArray(EVAL_CASES)).toBe(true);
    expect(typeof evalCaseSchema.safeParse).toBe("function");
    expect(typeof evalDatasetSchema.safeParse).toBe("function");
  });
});
