import { describe, expect, it } from "vitest";
import { educationEntrySchema } from "./education.js";

const validEducation = {
  id: "bsc-computer-science-example-university",
  institution: "Example University",
  credential: "BSc Computer Science",
  startDate: "2012-08",
  endDate: "2016-06",
};

describe("educationEntrySchema", () => {
  it("accepts a complete valid entry", () => {
    expect(educationEntrySchema.safeParse(validEducation).success).toBe(true);
  });

  it("accepts an entry with endDate omitted for in-progress study", () => {
    const { endDate: _endDate, ...withoutEndDate } = validEducation;
    expect(educationEntrySchema.safeParse(withoutEndDate).success).toBe(true);
  });

  it("rejects an endDate before the startDate", () => {
    const result = educationEntrySchema.safeParse({
      ...validEducation,
      startDate: "2016-06",
      endDate: "2012-08",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing an institution", () => {
    const { institution: _institution, ...withoutInstitution } = validEducation;
    expect(educationEntrySchema.safeParse(withoutInstitution).success).toBe(false);
  });

  it("rejects a startDate not in YYYY-MM form", () => {
    const result = educationEntrySchema.safeParse({ ...validEducation, startDate: "2012" });
    expect(result.success).toBe(false);
  });

  it("accepts an entry with startDate omitted, for a credential whose start date is not on record", () => {
    const { startDate: _startDate, ...withoutStartDate } = validEducation;
    expect(educationEntrySchema.safeParse(withoutStartDate).success).toBe(true);
  });

  it("accepts an entry with both startDate and endDate omitted", () => {
    const { startDate: _startDate, endDate: _endDate, ...withoutDates } = validEducation;
    expect(educationEntrySchema.safeParse(withoutDates).success).toBe(true);
  });
});
