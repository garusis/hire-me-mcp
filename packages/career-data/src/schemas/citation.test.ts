import { describe, expect, it } from "vitest";
import { citationSchema } from "./citation.js";

const validCitation = {
  entityType: "experience",
  entityId: "senior-engineer-acme-2021",
  label: "Senior Engineer, Acme Corp (2021–present)",
};

describe("citationSchema", () => {
  it("accepts a citation without a fragment", () => {
    const result = citationSchema.safeParse(validCitation);
    expect(result.success).toBe(true);
  });

  it("accepts a citation with a fragment anchoring a sub-part of the entity", () => {
    const result = citationSchema.safeParse({ ...validCitation, fragment: "highlights.0" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown entityType", () => {
    const result = citationSchema.safeParse({ ...validCitation, entityType: "not-a-type" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-kebab-case entityId", () => {
    const result = citationSchema.safeParse({ ...validCitation, entityId: "Not Kebab" });
    expect(result.success).toBe(false);
  });

  it("rejects a citation missing a human label", () => {
    const { label: _label, ...withoutLabel } = validCitation;
    const result = citationSchema.safeParse(withoutLabel);
    expect(result.success).toBe(false);
  });

  it("rejects an empty label", () => {
    const result = citationSchema.safeParse({ ...validCitation, label: "" });
    expect(result.success).toBe(false);
  });
});
