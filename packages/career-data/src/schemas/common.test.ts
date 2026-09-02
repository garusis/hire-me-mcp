import { describe, expect, it } from "vitest";
import { citableEntityTypeSchema, idSchema } from "./common.js";

describe("idSchema", () => {
  it("accepts a lowercase kebab-case id", () => {
    expect(idSchema.safeParse("senior-engineer-acme-2021").success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(idSchema.safeParse("").success).toBe(false);
  });

  it("rejects an id containing spaces", () => {
    expect(idSchema.safeParse("has spaces").success).toBe(false);
  });

  it("rejects an id with uppercase characters", () => {
    expect(idSchema.safeParse("Not-Kebab-Case").success).toBe(false);
  });

  it("rejects an id with a trailing hyphen", () => {
    expect(idSchema.safeParse("trailing-").success).toBe(false);
  });
});

describe("citableEntityTypeSchema", () => {
  it("accepts every known citable entity type", () => {
    for (const value of [
      "profile",
      "experience",
      "project",
      "skill",
      "gap",
      "education",
      "writing",
      "recommendation",
      "story",
    ]) {
      expect(citableEntityTypeSchema.safeParse(value).success).toBe(true);
    }
  });

  it("lists exactly one entity type per citable schema — a new schema must be added here deliberately", () => {
    expect([...citableEntityTypeSchema.options].sort()).toEqual(
      [
        "profile",
        "experience",
        "project",
        "skill",
        "gap",
        "education",
        "writing",
        "recommendation",
        "story",
      ].sort(),
    );
  });

  it("rejects an unknown entity type", () => {
    expect(citableEntityTypeSchema.safeParse("not-a-real-type").success).toBe(false);
  });
});
