import { describe, expect, it } from "vitest";
import { idSchema } from "./common.js";
import { COMPETENCIES, type Competency, competencySchema, isCompetency } from "./competency.js";

/** The owner-approved behavioral-competency vocabulary, verbatim from #289. */
const APPROVED_COMPETENCIES = [
  "adaptability",
  "collaboration",
  "communication",
  "customer-focus",
  "decision-making",
  "influence",
  "integrity",
  "leadership",
  "learning-agility",
  "learning-from-failure",
  "mentoring",
  "navigating-ambiguity",
  "ownership",
  "personal-accountability",
  "prioritization",
  "problem-solving",
  "process-improvement",
  "receptiveness-to-feedback",
  "resilience",
  "risk-management",
  "self-awareness",
  "stakeholder-management",
  "technical-judgment",
  "technical-leadership",
] as const;

describe("COMPETENCIES", () => {
  it("is exactly the owner-approved vocabulary, in sorted order, with no duplicates", () => {
    expect([...COMPETENCIES]).toEqual([...APPROVED_COMPETENCIES]);
    expect(new Set(COMPETENCIES).size).toBe(COMPETENCIES.length);
    expect([...COMPETENCIES]).toEqual([...COMPETENCIES].sort());
  });

  it("uses lower-kebab-case, single-behavior values — no compound values", () => {
    for (const competency of COMPETENCIES) {
      expect(idSchema.safeParse(competency).success).toBe(true);
      expect(competency).not.toMatch(/-and-/);
    }
  });
});

describe("competencySchema", () => {
  it("accepts every approved competency", () => {
    for (const competency of APPROVED_COMPETENCIES) {
      expect(competencySchema.safeParse(competency).success).toBe(true);
    }
  });

  it("rejects a compound value such as resilience-and-adaptability", () => {
    expect(competencySchema.safeParse("resilience-and-adaptability").success).toBe(false);
  });

  it("rejects a technology, domain or outcome masquerading as a competency", () => {
    for (const value of ["typescript", "fintech", "cost-reduction", "Leadership", ""]) {
      expect(competencySchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("isCompetency", () => {
  it("narrows a string to the Competency type when it is in the vocabulary", () => {
    const value: string = "ownership";
    if (isCompetency(value)) {
      const narrowed: Competency = value;
      expect(narrowed).toBe("ownership");
    } else {
      expect.unreachable("ownership is a competency");
    }
  });

  it("returns false for anything outside the vocabulary", () => {
    expect(isCompetency("kubernetes")).toBe(false);
    expect(isCompetency("ownership ")).toBe(false);
  });
});
