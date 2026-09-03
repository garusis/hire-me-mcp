import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import type { ProfileView, ProjectListItemView, Skill, WritingListItemView } from "../content";
import {
  getProfileView,
  getProjectsListView,
  getSkillsListView,
  getWritingListView,
} from "../content";
import { buildArticleJsonLd, buildPersonJsonLd, buildProjectJsonLd } from "./json-ld";

const SITE_URL = "https://stub-deploy.example.com";

function profileView(): ProfileView {
  return {
    citations: [],
    profile: {
      id: "profile",
      name: "Ada Fixture",
      headline: "Fixture Engineer",
      location: "Remote",
      availability: "open",
      summary: "A fixture summary of Ada.",
      contacts: [
        { label: "GitHub", url: "https://github.com/ada-fixture" },
        { label: "Email", url: "https://mailto.example.com/ada" },
      ],
    },
  };
}

function skills(): Skill[] {
  return [
    {
      id: "typescript",
      name: "TypeScript",
      aliases: [],
      category: "Languages",
      proficiency: "expert",
      evidence: [{ entityType: "project", entityId: "alpha-project", label: "Alpha Project" }],
    },
    {
      id: "react",
      name: "React",
      aliases: [],
      category: "Frameworks",
      proficiency: "proficient",
      evidence: [{ entityType: "project", entityId: "alpha-project", label: "Alpha Project" }],
    },
  ];
}

function projectItem(): ProjectListItemView {
  return {
    slug: "alpha-project",
    project: {
      id: "alpha-project",
      name: "Alpha Project",
      summary: "The alpha summary.",
      role: "Owner",
      tech: ["react", "typescript"],
      links: [{ label: "Source", url: "https://github.com/ada-fixture/alpha" }],
      body: "body",
    },
    citation: { entityType: "project", entityId: "alpha-project", label: "Alpha Project" },
  };
}

function writingItem(): WritingListItemView {
  return {
    slug: "fixture-writing-entry",
    entry: {
      id: "fixture-writing-entry",
      title: "Fixture Writing Entry",
      publishedDate: "2024-01-15",
      summary: "A fixture summary.",
      body: "Fixture body prose.",
    },
    citation: {
      entityType: "writing",
      entityId: "fixture-writing-entry",
      label: "Fixture Writing Entry",
    },
  };
}

describe("buildPersonJsonLd", () => {
  it("builds a schema.org Person from the profile view, with every value sourced from it", () => {
    const jsonLd = buildPersonJsonLd(profileView(), skills(), SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Person");
    expect(jsonLd.name).toBe("Ada Fixture");
    expect(jsonLd.jobTitle).toBe("Fixture Engineer");
    expect(jsonLd.description).toBe("A fixture summary of Ada.");
    expect(jsonLd.url).toBe(SITE_URL);
    expect(jsonLd.sameAs).toEqual([
      "https://github.com/ada-fixture",
      "https://mailto.example.com/ada",
    ]);
    expect(jsonLd.knowsAbout).toEqual(["TypeScript", "React"]);
  });

  it("changing the stub profile changes the emitted values", () => {
    const view = profileView();
    view.profile.name = "Changed Name";
    const jsonLd = buildPersonJsonLd(view, skills(), SITE_URL);
    expect(jsonLd.name).toBe("Changed Name");
  });

  it("changing the stub skills list changes the emitted knowsAbout", () => {
    const jsonLd = buildPersonJsonLd(profileView(), [skills()[0] as Skill], SITE_URL);
    expect(jsonLd.knowsAbout).toEqual(["TypeScript"]);
  });

  it("parses as valid JSON via JSON.stringify/JSON.parse round trip", () => {
    const jsonLd = buildPersonJsonLd(profileView(), skills(), SITE_URL);
    expect(() => JSON.parse(JSON.stringify(jsonLd))).not.toThrow();
  });
});

describe("buildProjectJsonLd", () => {
  it("builds a schema.org SoftwareSourceCode entry from the project view", () => {
    const jsonLd = buildProjectJsonLd(projectItem(), "Ada Fixture", SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("SoftwareSourceCode");
    expect(jsonLd.name).toBe("Alpha Project");
    expect(jsonLd.description).toBe("The alpha summary.");
    expect(jsonLd.url).toBe(`${SITE_URL}/projects/alpha-project`);
    expect(jsonLd.programmingLanguage).toEqual(["react", "typescript"]);
    expect(jsonLd.codeRepository).toBe("https://github.com/ada-fixture/alpha");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });

  it("changing the stub project changes the emitted values", () => {
    const item = projectItem();
    item.project.name = "Renamed Project";
    const jsonLd = buildProjectJsonLd(item, "Ada Fixture", SITE_URL);
    expect(jsonLd.name).toBe("Renamed Project");
  });
});

describe("buildArticleJsonLd", () => {
  it("builds a schema.org Article entry from the writing view", () => {
    const jsonLd = buildArticleJsonLd(writingItem(), "Ada Fixture", SITE_URL);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Fixture Writing Entry");
    expect(jsonLd.datePublished).toBe("2024-01-15");
    expect(jsonLd.description).toBe("A fixture summary.");
    expect(jsonLd.url).toBe(`${SITE_URL}/writing/fixture-writing-entry`);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ada Fixture" });
  });

  it("changing the stub writing entry changes the emitted values", () => {
    const item = writingItem();
    item.entry.title = "Renamed Article";
    const jsonLd = buildArticleJsonLd(item, "Ada Fixture", SITE_URL);
    expect(jsonLd.headline).toBe("Renamed Article");
  });
});

// #296 — the locked visibility boundary (#288): every sentence (>= 8
// words, same normalisation as the career-data `no-story-detail-in-
// experience` lint rule) of every real authored story's situation/task/
// actions/results/reflection, plus every story's title. Built from real
// data, checked against real JSON-LD output — not fixtures.
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

function expectNoStoryLeakage(value: unknown): void {
  const normalized = ` ${normalizeStoryProse(JSON.stringify(value))} `;
  const needles = [...realStorySentences(), ...realStoryTitles()];
  expect(needles.length).toBeGreaterThan(0);
  for (const needle of needles) {
    expect(normalized).not.toContain(` ${needle} `);
  }
}

describe("JSON-LD builders never leak real story content (#296)", () => {
  it("buildPersonJsonLd, built from the real profile and skills, contains no story sentence or title", () => {
    const jsonLd = buildPersonJsonLd(getProfileView(), getSkillsListView().items, SITE_URL);
    expectNoStoryLeakage(jsonLd);
  });

  it("buildProjectJsonLd, built from every real project, contains no story sentence or title", () => {
    for (const item of getProjectsListView().items) {
      const jsonLd = buildProjectJsonLd(item, "Marcos Alvarez", SITE_URL);
      expectNoStoryLeakage(jsonLd);
    }
  });

  it("buildArticleJsonLd, built from every real published writing entry, contains no story sentence or title", () => {
    for (const item of getWritingListView().items) {
      const jsonLd = buildArticleJsonLd(item, "Marcos Alvarez", SITE_URL);
      expectNoStoryLeakage(jsonLd);
    }
  });
});
