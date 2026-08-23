import {
  type CareerDataset,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getCvView } from "./cv";

function datasetWith(overrides: Partial<CareerDataset>): CareerDataset {
  return { ...emptyCareerDataset(), ...overrides };
}

const PROFILE = {
  id: "fixture-profile",
  name: "Fixture Person",
  headline: "Fixture Headline",
  location: "Fixture City",
  availability: "open" as const,
  summary: "Fixture summary of the fixture person.",
  contacts: [
    { label: "Email", url: "mailto:fixture@example.com" },
    { label: "GitHub", url: "https://github.com/fixture" },
  ],
};

const EXPERIENCE = [
  {
    id: "fixture-role-old",
    company: "Old Fixture Co",
    role: "Old Role",
    startDate: "2015-01",
    endDate: "2016-01",
    summary: "Old summary",
    highlights: ["Old highlight one", "Old highlight two", "Old highlight three"],
    tech: ["typescript"],
  },
  {
    id: "fixture-role-new",
    company: "New Fixture Co",
    role: "New Role",
    startDate: "2020-01",
    summary: "New summary",
    highlights: ["New highlight one"],
    tech: ["react"],
  },
];

const SKILLS = [
  {
    id: "fixture-skill-expert",
    name: "Fixture Expert Skill",
    aliases: [],
    category: "language" as const,
    proficiency: "expert" as const,
    evidence: [],
  },
  {
    id: "fixture-skill-familiar",
    name: "Fixture Familiar Skill",
    aliases: [],
    category: "tool" as const,
    proficiency: "familiar" as const,
    evidence: [],
  },
];

const EDUCATION = [
  {
    id: "fixture-education",
    institution: "Fixture University",
    credential: "Fixture Degree",
    startDate: "2010-01",
    endDate: "2014-01",
  },
];

describe("getCvView", () => {
  it("throws when no profile has been authored — a CV with no subject is not a renderable state", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({}));
    expect(() => getCvView(repository)).toThrow();
  });

  it("carries the profile through unchanged", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const view = getCvView(repository);
    expect(view.profile).toEqual(PROFILE);
  });

  it("derives a deterministic, human-meaningful filename from the profile name", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const view = getCvView(repository);
    expect(view.filename).toBe("fixture-person-cv.pdf");
  });

  it("orders experience reverse-chronologically, most recent first", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = getCvView(repository);
    expect(view.experience.map((item) => item.company)).toEqual([
      "New Fixture Co",
      "Old Fixture Co",
    ]);
  });

  it("caps highlights per role to the configured maximum, keeping authored order", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = getCvView(repository, { maxHighlightsPerRole: 2 });
    const oldRole = view.experience.find((item) => item.company === "Old Fixture Co");
    expect(oldRole?.highlights).toEqual(["Old highlight one", "Old highlight two"]);
  });

  it("groups skills by proficiency, expert first, each group's names in authored order", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const view = getCvView(repository);
    expect(view.skillsByProficiency).toEqual([
      { proficiency: "expert", names: ["Fixture Expert Skill"] },
      { proficiency: "familiar", names: ["Fixture Familiar Skill"] },
    ]);
  });

  it("carries education entries through unchanged, authored order", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const view = getCvView(repository);
    expect(view.education).toEqual(EDUCATION);
  });
});
