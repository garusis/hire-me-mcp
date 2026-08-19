import { describe, expect, it } from "vitest";
import { experienceEntrySchema } from "./experience.js";

const validExperience = {
  id: "senior-engineer-acme-2021",
  company: "Acme Corp",
  role: "Senior Engineer",
  startDate: "2021-03",
  summary: "Led the platform team rebuilding the billing pipeline.",
  highlights: ["Cut p99 latency by 40%", "Migrated billing to event sourcing"],
  tech: ["typescript", "postgres"],
};

describe("experienceEntrySchema", () => {
  it("accepts a complete valid entry with an end date", () => {
    const result = experienceEntrySchema.safeParse({ ...validExperience, endDate: "2023-06" });
    expect(result.success).toBe(true);
  });

  it("accepts an open-ended entry with endDate omitted", () => {
    expect(experienceEntrySchema.safeParse(validExperience).success).toBe(true);
  });

  it("rejects a startDate not in YYYY-MM form", () => {
    const result = experienceEntrySchema.safeParse({ ...validExperience, startDate: "March 2021" });
    expect(result.success).toBe(false);
  });

  it("rejects an endDate before the startDate", () => {
    const result = experienceEntrySchema.safeParse({
      ...validExperience,
      startDate: "2021-03",
      endDate: "2020-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with an empty highlights array", () => {
    const result = experienceEntrySchema.safeParse({ ...validExperience, highlights: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing a company", () => {
    const { company: _company, ...withoutCompany } = validExperience;
    expect(experienceEntrySchema.safeParse(withoutCompany).success).toBe(false);
  });
});
