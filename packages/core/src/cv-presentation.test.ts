import type { CareerStory, CvOverrides } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { buildCvPresentation } from "./cv-presentation.js";
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

const PROJECTS = [
  {
    id: "fixture-project-plain",
    name: "Plain Fixture Project",
    summary: "Plain fixture project summary.",
    role: "Fixture Maintainer",
    tech: ["typescript"],
    links: [{ label: "GitHub", url: "https://github.com/fixture/plain" }],
    body: "Plain fixture project body prose.",
  },
  {
    id: "fixture-project-flagship",
    name: "Flagship Fixture Project",
    summary: "Flagship fixture project summary.",
    role: "Fixture Creator",
    tech: ["typescript"],
    links: [
      { label: "GitHub", url: "https://github.com/fixture/flagship" },
      { label: "MCP endpoint", url: "https://fixture.example.test/api/mcp" },
    ],
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

const STORIES = [
  {
    id: "fixture-story-new-role",
    experienceId: "fixture-role-new",
    title: "Fixture Story Title",
    primaryCompetency: "leadership" as const,
    supportingCompetencies: [],
    situation: "Fixture situation prose.",
    task: "Fixture task prose.",
    actions: ["Fixture action one.", "Fixture action two."],
    results: ["Fixture result one."],
    retrievalTags: ["fixture-tag"],
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

describe("buildCvPresentation", () => {
  it("throws when no profile has been authored — a CV with no subject is not a renderable state", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({}));
    expect(() => buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES })).toThrow();
  });

  it("carries the profile through unchanged and defaults to canonical headline/summary with a canonical source", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.profile).toEqual(PROFILE);
    expect(view.headline).toBe(PROFILE.headline);
    expect(view.headlineSource).toBe("canonical");
    expect(view.summary).toBe(PROFILE.summary);
    expect(view.summarySource).toBe("canonical");
  });

  it("orders experience reverse-chronologically, most recent first, each carrying its canonical id", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.experience.map((item) => item.id)).toEqual([
      "fixture-role-new",
      "fixture-role-old",
    ]);
  });

  it("defaults bullets to canonical highlights, capped, with a canonical source", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = buildCvPresentation(repository, {
      overrides: EMPTY_OVERRIDES,
      maxHighlightsPerRole: 2,
    });
    const oldRole = view.experience.find((item) => item.id === "fixture-role-old");
    expect(oldRole?.bullets).toEqual(["Old highlight one", "Old highlight two"]);
    expect(oldRole?.bulletsSource).toBe("canonical");
  });

  it("computes a human-readable displayLine per role from company/role/dates", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    const newRole = view.experience.find((item) => item.id === "fixture-role-new");
    expect(newRole?.displayLine).toContain("New Role");
    expect(newRole?.displayLine).toContain("New Fixture Co");
    expect(newRole?.displayLine).toMatch(/present/i);
  });

  it("groups skills by category, each skill carrying its canonical id", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.skillGroups).toEqual([
      {
        category: "language",
        label: "language",
        skills: [{ id: "fixture-skill-expert", name: "Fixture Expert Skill" }],
      },
      {
        category: "tool",
        label: "tool",
        skills: [{ id: "fixture-skill-familiar", name: "Fixture Familiar Skill" }],
      },
    ]);
  });

  it("lists projects featured-first, each carrying its canonical id and a canonical summary source by default", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, projects: PROJECTS }),
    );
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.projects.map((project) => project.id)).toEqual([
      "fixture-project-flagship",
      "fixture-project-plain",
    ]);
    expect(view.projects.every((project) => project.summarySource === "canonical")).toBe(true);
  });

  it("carries education entries through unchanged, authored order", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const view = buildCvPresentation(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.education).toEqual(EDUCATION);
  });

  it("attaches every story whose primary experienceId matches the role, complete, when includeStories is true", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE, stories: STORIES }),
    );
    const view = buildCvPresentation(repository, {
      overrides: EMPTY_OVERRIDES,
      includeStories: true,
    });
    const newRole = view.experience.find((item) => item.id === "fixture-role-new");
    expect(newRole?.stories).toEqual([
      {
        title: "Fixture Story Title",
        situation: "Fixture situation prose.",
        task: "Fixture task prose.",
        actions: ["Fixture action one.", "Fixture action two."],
        results: ["Fixture result one."],
      },
    ]);
  });

  it("loads the real cv-overrides.json by default when no overrides option is passed", () => {
    const view = buildCvPresentation(createContentCareerDataRepository());
    expect(view.profile).toBeDefined();
  });
});

const OVERRIDES: CvOverrides = {
  profile: {
    headline: { general: "General headline", ai: "AI headline" },
    summary: { general: "General summary", ai: "AI summary" },
    timezoneLine: "Remote (UTC-5)",
  },
  experience: [
    {
      id: "fixture-role-new",
      bullets: {
        general: ["General bullet one", "General bullet two"],
        ai: ["AI bullet one"],
      },
      techAdditions: ["fixture-skill-by-id"],
    },
    {
      id: "fixture-role-old",
      compactLine: "Old Fixture Co, Old Role, 2015 - 2016 — one compact line.",
    },
  ],
  projects: [{ id: "fixture-project-plain", showOnCv: false }],
  education: [{ id: "fixture-education", line: "Fixture University — overridden line" }],
  skills: {
    categoryLabels: { language: "Languages", tool: "Tooling" },
    groupOrder: { general: ["tool", "language"], ai: ["language", "tool"] },
    excludeIds: ["fixture-skill-familiar"],
    displayNames: { "fixture-skill-expert": "Overridden Expert Name" },
  },
};

describe("buildCvPresentation CV-only overrides and source tracking", () => {
  it("computes headline/summary from the overlay per variant with an overlay source", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const generalView = buildCvPresentation(repository, {
      overrides: OVERRIDES,
      variant: "general",
    });
    expect(generalView.headline).toBe("General headline");
    expect(generalView.headlineSource).toBe("cv-overrides");
    expect(generalView.summary).toBe("General summary");
    expect(generalView.summarySource).toBe("cv-overrides");
    expect(generalView.timezoneLine).toBe("Remote (UTC-5)");
  });

  it("replaces a role's bullets with the overlay's per-variant bullets and marks the overlay source", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = buildCvPresentation(repository, { overrides: OVERRIDES, variant: "general" });
    const newRole = view.experience.find((item) => item.id === "fixture-role-new");
    expect(newRole?.bullets).toEqual(["General bullet one", "General bullet two"]);
    expect(newRole?.bulletsSource).toBe("cv-overrides");

    const oldRole = view.experience.find((item) => item.id === "fixture-role-old");
    expect(oldRole?.bulletsSource).toBe("canonical");
    expect(oldRole?.compactLine).toBe("Old Fixture Co, Old Role, 2015 - 2016 — one compact line.");
  });

  it("hides a project whose overlay entry sets showOnCv: false and marks an overridden summary's source", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, projects: PROJECTS }),
    );
    const overridesWithSummary: CvOverrides = {
      ...OVERRIDES,
      projects: [
        { id: "fixture-project-plain", showOnCv: false },
        { id: "fixture-project-flagship", showOnCv: true, summary: "Overridden flagship summary." },
      ],
    };
    const view = buildCvPresentation(repository, { overrides: overridesWithSummary });
    expect(view.projects.map((project) => project.id)).toEqual(["fixture-project-flagship"]);
    expect(view.projects[0]?.summary).toBe("Overridden flagship summary.");
    expect(view.projects[0]?.summarySource).toBe("cv-overrides");
  });

  it("applies display-name overrides to skill groups and marks the overridden skill's source", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const view = buildCvPresentation(repository, { overrides: OVERRIDES, variant: "general" });
    expect(view.skillGroups).toEqual([
      {
        category: "language",
        label: "Languages",
        skills: [{ id: "fixture-skill-expert", name: "Overridden Expert Name" }],
      },
    ]);
  });

  it("overrides an education entry's display line without changing the canonical credential", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const view = buildCvPresentation(repository, { overrides: OVERRIDES });
    expect(view.education[0]?.credential).toBe("Fixture Degree");
    expect(view.education[0]?.displayLine).toBe("Fixture University — overridden line");
  });
});

describe("buildCvPresentation never leaks real story content (#296)", () => {
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

  function storyUnits(story: CareerStory): string[] {
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

  it("the real presentation contains no story sentence from the real dataset (default projection, includeStories omitted)", () => {
    const view = buildCvPresentation(createContentCareerDataRepository());
    const normalized = ` ${normalizeStoryProse(JSON.stringify(view))} `;
    const needles = realStorySentences();
    expect(needles.length).toBeGreaterThan(0);
    for (const needle of needles) {
      expect(normalized).not.toContain(` ${needle} `);
    }
  });
});
