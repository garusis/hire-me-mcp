import { describe, expect, it } from "vitest";
import { goldenDatasetSchema, goldenQuerySchema } from "./schema.js";

function validExact() {
  return {
    id: "exact-typescript-skill",
    query: "Does he have expert-level TypeScript experience?",
    category: "exact" as const,
    expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
  };
}

function validAbsent() {
  return {
    id: "absent-blockchain",
    query: "Does he have blockchain or smart-contract development experience?",
    category: "absent-topic" as const,
    expectedSources: [],
    expectEmpty: true as const,
  };
}

describe("goldenQuerySchema", () => {
  it("accepts a well-formed exact-category entry", () => {
    expect(goldenQuerySchema.safeParse(validExact()).success).toBe(true);
  });

  it("accepts a well-formed absent-topic entry with expectEmpty: true and no expected sources", () => {
    expect(goldenQuerySchema.safeParse(validAbsent()).success).toBe(true);
  });

  it("accepts an optional notes field", () => {
    const result = goldenQuerySchema.safeParse({
      ...validExact(),
      notes: "skills.json: typescript",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an id that isn't kebab-case", () => {
    expect(goldenQuerySchema.safeParse({ ...validExact(), id: "Exact_TS" }).success).toBe(false);
  });

  it("rejects a non-exact/fuzzy/cross-cutting/absent-topic category", () => {
    expect(goldenQuerySchema.safeParse({ ...validExact(), category: "vague" }).success).toBe(false);
  });

  it("rejects an exact/fuzzy/cross-cutting entry with an empty expectedSources array", () => {
    expect(goldenQuerySchema.safeParse({ ...validExact(), expectedSources: [] }).success).toBe(
      false,
    );
  });

  it("rejects an absent-topic entry that omits expectEmpty: true", () => {
    const { expectEmpty, ...withoutFlag } = validAbsent();
    expect(goldenQuerySchema.safeParse(withoutFlag).success).toBe(false);
  });

  it("rejects an absent-topic entry with a non-empty expectedSources array", () => {
    const result = goldenQuerySchema.safeParse({
      ...validAbsent(),
      expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-absent-topic entry that sets expectEmpty: true", () => {
    expect(goldenQuerySchema.safeParse({ ...validExact(), expectEmpty: true }).success).toBe(false);
  });

  it("rejects an unknown extra field (strict schema)", () => {
    expect(goldenQuerySchema.safeParse({ ...validExact(), extra: "nope" }).success).toBe(false);
  });
});

describe("goldenDatasetSchema", () => {
  it("accepts an array of valid, uniquely-id'd entries", () => {
    expect(goldenDatasetSchema.safeParse([validExact(), validAbsent()]).success).toBe(true);
  });

  it("rejects a dataset with a duplicate id", () => {
    const result = goldenDatasetSchema.safeParse([validExact(), validExact()]);
    expect(result.success).toBe(false);
  });
});
