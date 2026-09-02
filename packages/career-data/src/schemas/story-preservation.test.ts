import { describe, expect, it } from "vitest";
import {
  STORY_FIELD_CLASSIFICATIONS,
  STORY_PRESERVATION_ACTIONS,
  storyPreservationEntrySchema,
  storyPreservationMapSchema,
} from "./story-preservation.js";

/**
 * The #290 field-to-story preservation map: one entry per experience
 * `summary` / `highlights.N`, classifying it and naming the canonical story
 * (if any) that holds its detailed narrative before #297 may shorten it.
 */
const validEntry = {
  experienceId: "fixture-role-fixtureco-2020",
  field: "highlights.0",
  classification: "detailed-story",
  storyIds: ["fixture-story"],
  action: "shorten",
  note: "The story holds the full narrative.",
};

describe("storyPreservationEntrySchema", () => {
  it("accepts a fully specified detailed-story entry", () => {
    expect(storyPreservationEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it("accepts a minimal role-context entry without storyIds or note", () => {
    const result = storyPreservationEntrySchema.safeParse({
      experienceId: "fixture-role-fixtureco-2020",
      field: "summary",
      classification: "role-context",
      action: "keep",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("storyIds");
  });

  it("accepts `summary` and `highlights.<n>` field locators only", () => {
    for (const field of ["summary", "highlights.0", "highlights.12"]) {
      expect(storyPreservationEntrySchema.safeParse({ ...validEntry, field }).success).toBe(true);
    }
    for (const field of ["highlights", "highlights.-1", "highlights.a", "tech.0", "body", ""]) {
      expect(storyPreservationEntrySchema.safeParse({ ...validEntry, field }).success).toBe(false);
    }
  });

  it("exposes the three classifications the #290 audit uses", () => {
    expect([...STORY_FIELD_CLASSIFICATIONS].sort()).toEqual(
      ["concise-outcome", "detailed-story", "role-context"].sort(),
    );
  });

  it("exposes the four #297 actions", () => {
    expect([...STORY_PRESERVATION_ACTIONS].sort()).toEqual(
      ["correct-inconsistency", "keep", "move-detail-to-story", "shorten"].sort(),
    );
  });

  it("rejects a classification or action outside the controlled sets", () => {
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, classification: "detailed" }).success,
    ).toBe(false);
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, action: "delete" }).success,
    ).toBe(false);
  });

  it("rejects an empty or duplicated storyIds list — omit the key when unused", () => {
    expect(storyPreservationEntrySchema.safeParse({ ...validEntry, storyIds: [] }).success).toBe(
      false,
    );
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, storyIds: ["a-story", "a-story"] })
        .success,
    ).toBe(false);
  });

  it("rejects a non-slug story id or experience id", () => {
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, storyIds: ["Not A Slug"] }).success,
    ).toBe(false);
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, experienceId: "Not A Slug" }).success,
    ).toBe(false);
  });

  it("rejects an empty note and unknown keys (hand-authored review data, so typos must fail loudly)", () => {
    expect(storyPreservationEntrySchema.safeParse({ ...validEntry, note: "" }).success).toBe(false);
    expect(
      storyPreservationEntrySchema.safeParse({ ...validEntry, storyId: "fixture-story" }).success,
    ).toBe(false);
  });
});

describe("storyPreservationMapSchema", () => {
  it("accepts an empty map and a map of distinct field locators", () => {
    expect(storyPreservationMapSchema.safeParse([]).success).toBe(true);
    expect(
      storyPreservationMapSchema.safeParse([validEntry, { ...validEntry, field: "summary" }])
        .success,
    ).toBe(true);
  });

  it("rejects two entries for the same experience field — every field is classified exactly once", () => {
    const result = storyPreservationMapSchema.safeParse([validEntry, { ...validEntry }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join("\n")).toMatch(
      /fixture-role-fixtureco-2020.*highlights\.0/,
    );
  });
});
