import type { CvOverrides } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { getCvPresentation } from "./get-cv-presentation.js";
import {
  type CareerDataset,
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

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
  contacts: [{ label: "Email", url: "mailto:fixture@example.com" }],
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
];

const PROJECTS = [
  {
    id: "fixture-project-flagship",
    name: "Flagship Fixture Project",
    summary: "Flagship fixture project summary.",
    role: "Fixture Creator",
    tech: ["typescript"],
    links: [{ label: "GitHub", url: "https://github.com/fixture/flagship" }],
    body: "Flagship fixture project body prose.",
    featured: true,
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

const EMPTY_OVERRIDES: CvOverrides = {
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

const OVERRIDES: CvOverrides = {
  profile: {
    headline: { general: "General headline" },
    summary: { general: "General summary" },
  },
  experience: [
    {
      id: "fixture-role-new",
      bullets: { general: ["General bullet one"] },
    },
  ],
  projects: [{ id: "fixture-project-flagship", showOnCv: true, summary: "Overridden summary." }],
  education: [{ id: "fixture-education", line: "Overridden line" }],
  skills: {
    categoryLabels: {},
    groupOrder: { general: ["language"], ai: ["language"] },
    excludeIds: [],
    displayNames: {},
  },
};

describe("getCvPresentation", () => {
  it("throws when no profile has been authored", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({}));
    expect(() => getCvPresentation(repository, { overrides: EMPTY_OVERRIDES })).toThrow();
  });

  it("defaults to the general variant and returns headline/summary with no overlay applied", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const result = getCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(result.data.variant).toBe("general");
    expect(result.data.headline).toBe(PROFILE.headline);
    expect(result.data.summary).toBe(PROFILE.summary);
  });

  it("cites the profile entity for headline and summary, without an overlay fragment when nothing is overridden", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const result = getCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    const profileCitations = result.citations.filter(
      (citation) => citation.entityType === "profile",
    );
    expect(profileCitations).toHaveLength(2);
    for (const citation of profileCitations) {
      expect(citation.entityId).toBe(PROFILE.id);
      expect(citation.fragment).not.toContain("cv-overrides");
    }
  });

  it("marks the headline/summary citations with a cv-overrides fragment when the overlay supplies them", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const result = getCvPresentation(repository, { overrides: OVERRIDES });
    expect(result.data.headline).toBe("General headline");
    expect(result.data.summary).toBe("General summary");
    const profileCitations = result.citations.filter(
      (citation) => citation.entityType === "profile",
    );
    for (const citation of profileCitations) {
      expect(citation.fragment).toContain("cv-overrides");
    }
  });

  it("returns experience entries carrying their canonical id, with a citation per entry marking overlay-sourced bullets", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const result = getCvPresentation(repository, { overrides: OVERRIDES });
    expect(result.data.experience.map((item) => item.id)).toEqual([
      "fixture-role-new",
      "fixture-role-old",
    ]);
    // The overlay overrode fixture-role-new's bullets only.
    const newRole = result.data.experience.find((item) => item.id === "fixture-role-new");
    expect(newRole?.bullets).toEqual(["General bullet one"]);
    expect((newRole as Record<string, unknown>).bulletsSource).toBeUndefined();

    const newRoleCitation = result.citations.find(
      (citation) =>
        citation.entityType === "experience" && citation.entityId === "fixture-role-new",
    );
    expect(newRoleCitation?.fragment).toContain("cv-overrides");

    const oldRoleCitation = result.citations.find(
      (citation) =>
        citation.entityType === "experience" && citation.entityId === "fixture-role-old",
    );
    expect(oldRoleCitation?.fragment).not.toContain("cv-overrides");
  });

  it("returns project entries carrying their canonical id, with a citation marking an overridden summary", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, projects: PROJECTS }),
    );
    const result = getCvPresentation(repository, { overrides: OVERRIDES });
    expect(result.data.projects[0]?.id).toBe("fixture-project-flagship");
    expect(result.data.projects[0]?.summary).toBe("Overridden summary.");
    expect((result.data.projects[0] as Record<string, unknown>).summarySource).toBeUndefined();
    const projectCitation = result.citations.find((citation) => citation.entityType === "project");
    expect(projectCitation?.fragment).toContain("cv-overrides");
  });

  it("returns skill groups with each skill carrying its canonical id, plus a citation per skill", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const result = getCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(result.data.skillGroups[0]?.skills).toEqual([
      { id: "fixture-skill-expert", name: "Fixture Expert Skill" },
    ]);
    const skillCitation = result.citations.find(
      (citation) => citation.entityType === "skill" && citation.entityId === "fixture-skill-expert",
    );
    expect(skillCitation).toBeDefined();
  });

  it("returns education entries with a citation marking an overridden display line", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const result = getCvPresentation(repository, { overrides: OVERRIDES });
    expect(result.data.education[0]?.displayLine).toBe("Overridden line");
    const educationCitation = result.citations.find(
      (citation) => citation.entityType === "education",
    );
    expect(educationCitation?.fragment).toContain("cv-overrides");
  });

  it("supports the ai variant", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const overrides: CvOverrides = {
      ...OVERRIDES,
      profile: { headline: { ai: "AI headline" }, summary: { ai: "AI summary" } },
    };
    const result = getCvPresentation(repository, { overrides, variant: "ai" });
    expect(result.data.variant).toBe("ai");
    expect(result.data.headline).toBe("AI headline");
    expect(result.data.summary).toBe("AI summary");
  });

  it("loads the real overlay by default and never leaks story content or a profile field in its data (#296)", () => {
    const result = getCvPresentation(createContentCareerDataRepository());
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('"profile"');
    expect(result.data.headline.length).toBeGreaterThan(0);
  });
});

// #296 — the same locked visibility boundary `cv-presentation.test.ts` and
// `apps/web/lib/cv/render-cv-html.test.ts` guard, checked here against the
// exact MCP tool response payload (`getCvPresentation(...).data`), since
// that response — not just the web-only `CvView` — is what a public,
// anonymous MCP client actually receives.
describe("getCvPresentation never leaks real story content into the MCP response (#296)", () => {
  const MIN_STORY_SENTENCE_WORDS = 8;

  function normalizeStoryProse(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function storySentencesOf(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
  }

  function longSentencesOf(unit: string): string[] {
    return storySentencesOf(unit)
      .map((sentence) => normalizeStoryProse(sentence))
      .filter((normalized) => normalized.split(" ").length >= MIN_STORY_SENTENCE_WORDS);
  }

  function storyUnits(story: {
    situation: string;
    task: string;
    actions: string[];
    results: string[];
    reflection?: string;
  }): string[] {
    return [
      story.situation,
      story.task,
      ...story.actions,
      ...story.results,
      ...(story.reflection === undefined ? [] : [story.reflection]),
    ];
  }

  function realStorySentences(): string[] {
    const dataset = createContentCareerDataRepository().getDataset();
    return dataset.stories.flatMap((story) => storyUnits(story).flatMap(longSentencesOf));
  }

  it.each(["general", "ai"] as const)(
    "the real MCP tool response contains no story sentence from the real dataset (%s variant)",
    (variant) => {
      const result = getCvPresentation(createContentCareerDataRepository(), { variant });
      const normalized = ` ${normalizeStoryProse(JSON.stringify(result.data))} `;
      const needles = realStorySentences();
      expect(needles.length).toBeGreaterThan(0);
      for (const needle of needles) {
        expect(normalized).not.toContain(` ${needle} `);
      }
    },
  );
});
