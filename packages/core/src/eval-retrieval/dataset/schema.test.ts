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

describe("goldenQuerySchema: matchMode / preferredSource (#295)", () => {
  function validFuzzy(overrides: Record<string, unknown> = {}) {
    return {
      id: "fuzzy-leadership-general",
      query: "Tell me about a time he stepped into leadership without formal authority.",
      category: "fuzzy" as const,
      expectedSources: [
        { sourceType: "story", sourceId: "xogito-client-account-recovery" },
        { sourceType: "story", sourceId: "mutual-informal-leadership" },
      ],
      ...overrides,
    };
  }

  it("accepts an entry that omits matchMode and preferredSource", () => {
    expect(goldenQuerySchema.safeParse(validExact()).success).toBe(true);
  });

  it("accepts matchMode: 'any' with a single acceptable source", () => {
    expect(goldenQuerySchema.safeParse(validFuzzy({ matchMode: "any" })).success).toBe(true);
  });

  it("accepts matchMode: 'all'", () => {
    expect(goldenQuerySchema.safeParse(validFuzzy({ matchMode: "all" })).success).toBe(true);
  });

  it("rejects an unknown matchMode value", () => {
    expect(goldenQuerySchema.safeParse(validFuzzy({ matchMode: "some" })).success).toBe(false);
  });

  it("accepts a preferredSource that also appears in expectedSources", () => {
    expect(
      goldenQuerySchema.safeParse(
        validFuzzy({
          matchMode: "any",
          preferredSource: { sourceType: "story", sourceId: "xogito-client-account-recovery" },
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects a preferredSource that does not appear in expectedSources", () => {
    const result = goldenQuerySchema.safeParse(
      validFuzzy({
        matchMode: "any",
        preferredSource: { sourceType: "story", sourceId: "not-in-expected-sources" },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects duplicate (sourceType, sourceId) pairs in expectedSources", () => {
    const result = goldenQuerySchema.safeParse(
      validFuzzy({
        expectedSources: [
          { sourceType: "story", sourceId: "xogito-client-account-recovery" },
          { sourceType: "story", sourceId: "xogito-client-account-recovery" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an absent-topic entry that declares matchMode", () => {
    expect(goldenQuerySchema.safeParse({ ...validAbsent(), matchMode: "any" }).success).toBe(false);
  });

  it("rejects an absent-topic entry that declares preferredSource", () => {
    expect(
      goldenQuerySchema.safeParse({
        ...validAbsent(),
        preferredSource: { sourceType: "story", sourceId: "x" },
      }).success,
    ).toBe(false);
  });

  it("rejects a cross-cutting entry that declares matchMode: 'any'", () => {
    const result = goldenQuerySchema.safeParse(
      validFuzzy({ category: "cross-cutting", matchMode: "any" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a cross-cutting entry that declares matchMode: 'all'", () => {
    const result = goldenQuerySchema.safeParse(
      validFuzzy({ category: "cross-cutting", matchMode: "all" }),
    );
    expect(result.success).toBe(true);
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
