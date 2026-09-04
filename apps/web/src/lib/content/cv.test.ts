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
