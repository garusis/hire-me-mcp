import { describe, expect, it } from "vitest";
import { isKnownTechTag, TECH_TAGS } from "./tech-tags.js";

describe("TECH_TAGS", () => {
  it("is a non-empty list", () => {
    expect(TECH_TAGS.length).toBeGreaterThan(0);
  });

  it("contains only lowercase kebab-case entries", () => {
    for (const tag of TECH_TAGS) {
      expect(tag).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(TECH_TAGS).size).toBe(TECH_TAGS.length);
  });

  it("covers the flagship hire-me-mcp project's stack (#191)", () => {
    for (const tag of ["nextjs", "vercel", "playwright", "mcp", "rag", "github-actions"]) {
      expect(TECH_TAGS).toContain(tag);
    }
  });

  it("uses the canonical postgresql spelling, never a variant", () => {
    expect(TECH_TAGS).toContain("postgresql");
    expect(TECH_TAGS).not.toContain("postgres");
    expect(TECH_TAGS).not.toContain("Postgres");
    expect(TECH_TAGS).not.toContain("PostgreSQL");
  });
});

describe("isKnownTechTag", () => {
  it("returns true for a tag in the vocabulary", () => {
    expect(isKnownTechTag("typescript")).toBe(true);
  });

  it("returns false for a tag not in the vocabulary", () => {
    expect(isKnownTechTag("cobol")).toBe(false);
  });

  it("returns false for a differently-cased variant of a known tag", () => {
    expect(isKnownTechTag("TypeScript")).toBe(false);
  });
});

describe("TECH_TAGS coverage for #309 stage 3 evidenced-but-missing skills", () => {
  it("includes the tags backing skills added for the CV keyword gap (#309 action 6)", () => {
    for (const tag of [
      "pgvector",
      "vitest",
      "zod",
      "gemini",
      "new-relic",
      "ecs",
      "dynamodb",
      "webhooks",
      "etl",
    ]) {
      expect(TECH_TAGS).toContain(tag);
    }
  });

  it("includes llm-evaluation, the eval-CI-lane skill added in #309 stage 3 round 3", () => {
    expect(TECH_TAGS).toContain("llm-evaluation");
  });
});

describe("TECH_TAGS coverage for #315/#316 past, non-CV skills", () => {
  it("includes redux and ruby-on-rails, added as confirmed-but-off-CV skills", () => {
    for (const tag of ["redux", "ruby-on-rails"]) {
      expect(TECH_TAGS).toContain(tag);
    }
  });
});
