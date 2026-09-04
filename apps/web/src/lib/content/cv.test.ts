import type { CvOverrides } from "@hire-me-mcp/career-data";
import {
  type CareerDataset,
  createContentCareerDataRepository,
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
  {
    id: "fixture-story-old-role",
    experienceId: "fixture-role-old",
    title: "Fixture Other Story Title",
    primaryCompetency: "problem-solving" as const,
    supportingCompetencies: [],
    situation: "Fixture other situation prose.",
    task: "Fixture other task prose.",
    actions: ["Fixture other action."],
    results: ["Fixture other result."],
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

  it("resolves each entry's tech tags to display names (#299): skill id first, then alias, else the raw tag", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({
        profile: PROFILE,
        experience: [
          {
            id: "fixture-role-tech",
            company: "Tech Fixture Co",
            role: "Tech Role",
            startDate: "2021-01",
            summary: "Tech summary",
            highlights: ["Tech highlight"],
            tech: ["fixture-skill-by-id", "fixture-skill-by-alias", "unclaimed-tag"],
          },
        ],
        skills: [
          {
            id: "fixture-skill-by-id",
            name: "Fixture Skill By Id",
            aliases: [],
            category: "language",
            proficiency: "expert",
            evidence: [],
          },
          {
            id: "fixture-skill-with-alias",
            name: "Fixture Skill With Alias",
            aliases: ["fixture-skill-by-alias"],
            category: "tool",
            proficiency: "proficient",
            evidence: [],
          },
        ],
      }),
    );
    const view = getCvView(repository);
    expect(view.experience[0]?.tech).toEqual([
      "Fixture Skill By Id",
      "Fixture Skill With Alias",
      "unclaimed-tag",
    ]);
  });

  it("groups skills by category (#309 stage 3) when no overlay is provided, one group per authored category", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const view = getCvView(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.skillGroups).toEqual([
      { category: "language", label: "language", names: ["Fixture Expert Skill"] },
      { category: "tool", label: "tool", names: ["Fixture Familiar Skill"] },
    ]);
  });

  it("lists projects featured-first (#232), trimmed to name/role/summary/links — no long-form body", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, projects: PROJECTS }),
    );
    const view = getCvView(repository);
    expect(view.projects).toEqual([
      {
        name: "Flagship Fixture Project",
        role: "Fixture Creator",
        summary: "Flagship fixture project summary.",
        links: [
          { label: "GitHub", url: "https://github.com/fixture/flagship" },
          { label: "MCP endpoint", url: "https://fixture.example.test/api/mcp" },
        ],
      },
      {
        name: "Plain Fixture Project",
        role: "Fixture Maintainer",
        summary: "Plain fixture project summary.",
        links: [{ label: "GitHub", url: "https://github.com/fixture/plain" }],
      },
    ]);
  });

  it("carries education entries through unchanged, authored order", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const view = getCvView(repository);
    expect(view.education).toEqual(EDUCATION);
  });

  it("omits per-role summary and stories by default (#309 stage 1 — web mode unchanged)", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE, stories: STORIES }),
    );
    const view = getCvView(repository);
    for (const item of view.experience) {
      expect(item.summary).toBeUndefined();
      expect(item.stories).toBeUndefined();
    }
  });

  it("includes each role's full summary when includeSummary is true (#309 stage 1)", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = getCvView(repository, { includeSummary: true });
    const newRole = view.experience.find((item) => item.company === "New Fixture Co");
    const oldRole = view.experience.find((item) => item.company === "Old Fixture Co");
    expect(newRole?.summary).toBe("New summary");
    expect(oldRole?.summary).toBe("Old summary");
  });

  it("keeps every highlight, uncapped, when maxHighlightsPerRole is Infinity (#309 stage 1)", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = getCvView(repository, { maxHighlightsPerRole: Number.POSITIVE_INFINITY });
    const oldRole = view.experience.find((item) => item.company === "Old Fixture Co");
    expect(oldRole?.highlights).toEqual([
      "Old highlight one",
      "Old highlight two",
      "Old highlight three",
    ]);
  });

  it("attaches every story whose primary experienceId matches the role, complete, when includeStories is true (#309 stage 1)", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE, stories: STORIES }),
    );
    const view = getCvView(repository, { includeStories: true });
    const newRole = view.experience.find((item) => item.company === "New Fixture Co");
    const oldRole = view.experience.find((item) => item.company === "Old Fixture Co");
    expect(newRole?.stories).toEqual([
      {
        title: "Fixture Story Title",
        situation: "Fixture situation prose.",
        task: "Fixture task prose.",
        actions: ["Fixture action one.", "Fixture action two."],
        results: ["Fixture result one."],
      },
    ]);
    expect(oldRole?.stories).toEqual([
      {
        title: "Fixture Other Story Title",
        situation: "Fixture other situation prose.",
        task: "Fixture other task prose.",
        actions: ["Fixture other action."],
        results: ["Fixture other result."],
      },
    ]);
  });

  it("attaches an empty stories array to a role with no matching story when includeStories is true (#309 stage 1)", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE, stories: [] }),
    );
    const view = getCvView(repository, { includeStories: true });
    for (const item of view.experience) {
      expect(item.stories).toEqual([]);
    }
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

describe("getCvView CV-only overrides (#309 stage 3)", () => {
  it("defaults to the general variant and leaves the canonical profile object untouched", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const view = getCvView(repository, { overrides: OVERRIDES });
    expect(view.variant).toBe("general");
    expect(view.profile).toEqual(PROFILE);
  });

  it("computes headline/summary/timezoneLine from the overlay per variant, without touching profile.headline/profile.summary", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const generalView = getCvView(repository, { overrides: OVERRIDES, variant: "general" });
    expect(generalView.headline).toBe("General headline");
    expect(generalView.summary).toBe("General summary");
    expect(generalView.timezoneLine).toBe("Remote (UTC-5)");

    const aiView = getCvView(repository, { overrides: OVERRIDES, variant: "ai" });
    expect(aiView.headline).toBe("AI headline");
    expect(aiView.summary).toBe("AI summary");
  });

  it("falls back to profile.headline/profile.summary when the overlay has no override for a field", () => {
    const repository = createInMemoryCareerDataRepository(datasetWith({ profile: PROFILE }));
    const view = getCvView(repository, { overrides: EMPTY_OVERRIDES });
    expect(view.headline).toBe(PROFILE.headline);
    expect(view.summary).toBe(PROFILE.summary);
    expect(view.timezoneLine).toBeUndefined();
  });

  it("replaces a role's highlights with the overlay's per-variant bullets when present", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const generalView = getCvView(repository, { overrides: OVERRIDES, variant: "general" });
    const newRoleGeneral = generalView.experience.find((item) => item.company === "New Fixture Co");
    expect(newRoleGeneral?.highlights).toEqual(["General bullet one", "General bullet two"]);

    const aiView = getCvView(repository, { overrides: OVERRIDES, variant: "ai" });
    const newRoleAi = aiView.experience.find((item) => item.company === "New Fixture Co");
    expect(newRoleAi?.highlights).toEqual(["AI bullet one"]);
  });

  it("appends techAdditions, resolved to display names, after the entry's own tech", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({
        profile: PROFILE,
        experience: EXPERIENCE,
        skills: [
          {
            id: "fixture-skill-by-id",
            name: "Fixture Skill By Id",
            aliases: [],
            category: "language",
            proficiency: "expert",
            evidence: [],
          },
        ],
      }),
    );
    const view = getCvView(repository, { overrides: OVERRIDES });
    const newRole = view.experience.find((item) => item.company === "New Fixture Co");
    expect(newRole?.tech).toEqual(["react", "Fixture Skill By Id"]);
  });

  it("sets compactLine from the overlay, leaving highlights untouched for the earlier-experience block", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, experience: EXPERIENCE }),
    );
    const view = getCvView(repository, { overrides: OVERRIDES });
    const oldRole = view.experience.find((item) => item.company === "Old Fixture Co");
    expect(oldRole?.compactLine).toBe("Old Fixture Co, Old Role, 2015 - 2016 — one compact line.");
    const newRole = view.experience.find((item) => item.company === "New Fixture Co");
    expect(newRole?.compactLine).toBeUndefined();
  });

  it("hides a project whose overlay entry sets showOnCv: false, keeps every other project shown by default", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, projects: PROJECTS }),
    );
    const view = getCvView(repository, { overrides: OVERRIDES });
    expect(view.projects.map((project) => project.name)).toEqual(["Flagship Fixture Project"]);
  });

  it("overrides an education entry's display line without changing the canonical credential", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, education: EDUCATION }),
    );
    const view = getCvView(repository, { overrides: OVERRIDES });
    expect(view.education[0]?.credential).toBe("Fixture Degree");
    expect(view.education[0]?.displayLine).toBe("Fixture University — overridden line");
  });

  it("omits an education entry with showOnCv: false, keeping every other entry shown by default", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({
        profile: PROFILE,
        education: [
          ...EDUCATION,
          {
            id: "fixture-education-hidden",
            institution: "Fixture Low-Signal Institute",
            credential: "Fixture Certificate",
          },
        ],
      }),
    );
    const overridesWithHiddenEducation = {
      ...OVERRIDES,
      education: [...OVERRIDES.education, { id: "fixture-education-hidden", showOnCv: false }],
    };
    const view = getCvView(repository, { overrides: overridesWithHiddenEducation });
    expect(view.education.map((entry) => entry.id)).toEqual(["fixture-education"]);
  });

  it("groups skills by category, excludes ids, applies display-name overrides, and orders groups per variant", () => {
    const repository = createInMemoryCareerDataRepository(
      datasetWith({ profile: PROFILE, skills: SKILLS }),
    );
    const generalView = getCvView(repository, { overrides: OVERRIDES, variant: "general" });
    // "tool" is first in the general groupOrder, but its only skill
    // (fixture-skill-familiar) is excluded, so the whole group is dropped
    // rather than rendering an empty "Tooling:" line.
    expect(generalView.skillGroups).toEqual([
      { category: "language", label: "Languages", names: ["Overridden Expert Name"] },
    ]);

    const aiView = getCvView(repository, { overrides: OVERRIDES, variant: "ai" });
    expect(aiView.skillGroups[0]).toEqual({
      category: "language",
      label: "Languages",
      names: ["Overridden Expert Name"],
    });
  });
});

// #296 — the locked visibility boundary (#288): every sentence (>= 8
// words, same normalisation as the career-data `no-story-detail-in-
// experience` lint rule) of every real authored story's situation/task/
// actions/results/reflection, plus every story's title. Checked against
// the real CV view (real repository, not a fixture).
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

function realStorySentences(): string[] {
  const dataset = createContentCareerDataRepository().getDataset();
  const sentences: string[] = [];
  for (const story of dataset.stories) {
    const units = [
      story.situation,
      story.task,
      ...story.actions,
      ...story.results,
      ...(story.reflection === undefined ? [] : [story.reflection]),
    ];
    for (const unit of units) {
      for (const sentence of storySentencesOf(unit)) {
        const normalized = normalizeStoryProse(sentence);
        if (normalized.split(" ").length >= MIN_STORY_SENTENCE_WORDS) {
          sentences.push(normalized);
        }
      }
    }
  }
  return sentences;
}

function realStoryTitles(): string[] {
  return createContentCareerDataRepository()
    .getDataset()
    .stories.map((story) => normalizeStoryProse(story.title));
}

describe("getCvView never leaks real story content (#296)", () => {
  it("the real CV view contains no story sentence or title from the real dataset", () => {
    const view = getCvView(createContentCareerDataRepository());
    const normalized = ` ${normalizeStoryProse(JSON.stringify(view))} `;
    const needles = [...realStorySentences(), ...realStoryTitles()];
    expect(needles.length).toBeGreaterThan(0);

    for (const needle of needles) {
      expect(normalized).not.toContain(` ${needle} `);
    }
  });
});
