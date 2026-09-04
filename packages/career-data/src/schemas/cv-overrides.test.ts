import { describe, expect, it } from "vitest";
import { type CvOverrides, cvOverridesSchema, cvVariantSchema } from "./cv-overrides.js";

const VALID: CvOverrides = {
  profile: {
    headline: { general: "General headline", ai: "AI headline" },
    summary: { general: "General summary" },
    timezoneLine: "Remote (UTC-5, full US-hours overlap)",
  },
  experience: [
    {
      id: "fixture-role",
      bullets: { general: ["Bullet one"], ai: ["AI bullet one", "AI bullet two"] },
      techAdditions: ["zod"],
      techExcludeIds: ["aws"],
      keepTogether: true,
    },
    {
      id: "fixture-early-role",
      compactLine: "Fixture early role, one dated line.",
    },
  ],
  projects: [
    { id: "fixture-project", showOnCv: false },
    {
      id: "fixture-project-with-summary",
      showOnCv: true,
      summary: "Fixture CV-only project summary.",
      excludeLinkLabels: ["MCP endpoint"],
    },
  ],
  education: [{ id: "fixture-education", line: "Fixture University, coursework toward a degree" }],
  skills: {
    categoryLabels: { language: "Languages" },
    groupOrder: { general: ["language", "backend"], ai: ["ai-ml", "language"] },
    excludeIds: ["angularjs"],
    displayNames: { "regulated-data-handling": "PII handling, field-level encryption" },
    categoryOverrides: { react: "frontend", nextjs: "frontend" },
  },
};

describe("cvVariantSchema", () => {
  it("accepts general and ai", () => {
    expect(cvVariantSchema.parse("general")).toBe("general");
    expect(cvVariantSchema.parse("ai")).toBe("ai");
  });

  it("rejects an unknown variant", () => {
    expect(cvVariantSchema.safeParse("recruiter").success).toBe(false);
  });
});

describe("cvOverridesSchema", () => {
  it("parses a fully-authored overlay", () => {
    expect(cvOverridesSchema.parse(VALID)).toEqual(VALID);
  });

  it("parses an empty overlay (nothing overridden yet)", () => {
    const empty: CvOverrides = {
      profile: {},
      experience: [],
      projects: [],
      education: [],
      skills: {
        categoryLabels: {},
        groupOrder: { general: ["language"], ai: ["language"] },
        excludeIds: [],
        displayNames: {},
      },
    };
    expect(cvOverridesSchema.parse(empty)).toEqual(empty);
  });

  it("rejects a profile.headline with neither variant set", () => {
    const invalid = { ...VALID, profile: { ...VALID.profile, headline: {} } };
    expect(cvOverridesSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an experience override with no id", () => {
    const invalid = {
      ...VALID,
      experience: [{ bullets: { general: ["x"] } }],
    };
    expect(cvOverridesSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects skills.groupOrder missing a variant", () => {
    const invalid = {
      ...VALID,
      skills: { ...VALID.skills, groupOrder: { general: ["language"] } },
    };
    expect(cvOverridesSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts an education override that hides the entry from the CV via showOnCv: false, with no line", () => {
    const withHiddenEducation: CvOverrides = {
      ...VALID,
      education: [...VALID.education, { id: "fixture-education-hidden", showOnCv: false }],
    };
    expect(cvOverridesSchema.parse(withHiddenEducation)).toEqual(withHiddenEducation);
  });

  it("accepts an experience override's techExcludeIds and keepTogether (#309 stage 3 second review, items 5 and 7)", () => {
    const parsed = cvOverridesSchema.parse(VALID);
    expect(parsed.experience[0]?.techExcludeIds).toEqual(["aws"]);
    expect(parsed.experience[0]?.keepTogether).toBe(true);
  });

  it("accepts a project override's CV-only summary and excludeLinkLabels (#309 stage 3 second review, items 14 and 17)", () => {
    const parsed = cvOverridesSchema.parse(VALID);
    const withSummary = parsed.projects.find(
      (project) => project.id === "fixture-project-with-summary",
    );
    expect(withSummary?.summary).toBe("Fixture CV-only project summary.");
    expect(withSummary?.excludeLinkLabels).toEqual(["MCP endpoint"]);
  });

  it("accepts skills.categoryOverrides reassigning a skill's CV category (#309 stage 3 second review, item 15)", () => {
    const parsed = cvOverridesSchema.parse(VALID);
    expect(parsed.skills.categoryOverrides).toEqual({ react: "frontend", nextjs: "frontend" });
  });

  it("defaults skills.categoryOverrides to undefined when not authored (backward compatible)", () => {
    const empty: CvOverrides = {
      profile: {},
      experience: [],
      projects: [],
      education: [],
      skills: {
        categoryLabels: {},
        groupOrder: { general: ["language"], ai: ["language"] },
        excludeIds: [],
        displayNames: {},
      },
    };
    expect(cvOverridesSchema.parse(empty).skills.categoryOverrides).toBeUndefined();
  });
});
