import { describe, expect, it } from "vitest";
import {
  citationSchema,
  educationEntrySchema,
  experienceEntrySchema,
  gapSchema,
  profileSchema,
  projectSchema,
  skillSchema,
  writingEntrySchema,
} from "./entity-schemas.js";

describe("entity-schemas re-exports", () => {
  it("re-exports every citable entity's Zod schema plus the citation schema", () => {
    for (const schema of [
      citationSchema,
      educationEntrySchema,
      experienceEntrySchema,
      gapSchema,
      profileSchema,
      projectSchema,
      skillSchema,
      writingEntrySchema,
    ]) {
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe("function");
    }
  });

  it("citationSchema accepts a well-formed citation and rejects a label-less one", () => {
    const good = { entityType: "skill", entityId: "typescript", label: "TypeScript" };
    expect(citationSchema.safeParse(good).success).toBe(true);
    expect(citationSchema.safeParse({ entityType: "skill", entityId: "x" }).success).toBe(false);
  });
});
