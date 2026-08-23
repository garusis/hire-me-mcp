import { describe, expect, it } from "vitest";
import { GOLDEN_QUERIES, goldenDatasetSchema, goldenQuerySchema } from "./index.js";

describe("dataset module entry point", () => {
  it("re-exports the golden dataset and its schemas together", () => {
    expect(Array.isArray(GOLDEN_QUERIES)).toBe(true);
    expect(GOLDEN_QUERIES.length).toBeGreaterThan(0);
    expect(typeof goldenQuerySchema.safeParse).toBe("function");
    expect(goldenDatasetSchema.safeParse(GOLDEN_QUERIES).success).toBe(true);
  });
});
