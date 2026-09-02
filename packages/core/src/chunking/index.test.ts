import type { CareerDataset } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import {
  chunkCareerData,
  chunkEducation,
  chunkExperience,
  chunkGap,
  chunkProfile,
  chunkProject,
  chunkSkill,
  chunkWriting,
} from "./index.js";

function buildDataset(overrides: Partial<CareerDataset> = {}): CareerDataset {
  const base: CareerDataset = {
    profile: {
      id: "jane-doe",
      name: "Jane Doe",
      headline: "Senior Engineer",
      location: "Remote",
      availability: "open",
      summary: "Builds reliable systems.",
      contacts: [{ label: "Email", url: "mailto:jane@example.com" }],
    },
    experience: [
      {
        id: "acme-role",
        company: "Acme",
        role: "Engineer",
        startDate: "2020-01",
        endDate: "2021-01",
        summary: "Did engineering work at Acme.",
        highlights: ["Shipped feature X", "Reduced latency by 30%"],
        tech: ["typescript"],
      },
      {
        id: "globex-role",
        company: "Globex",
        role: "Senior Engineer",
        startDate: "2021-02",
        endDate: undefined,
        summary: "Leads the platform team at Globex.",
        highlights: ["Rebuilt the deploy pipeline"],
        tech: ["nodejs", "aws"],
      },
    ],
    projects: [
      {
        id: "cool-project",
        name: "Cool Project",
        summary: "A cool open-source project.",
        role: "Creator",
        tech: ["python"],
        links: [{ label: "GitHub", url: "https://github.com/example/cool" }],
        body: Array.from(
          { length: 40 },
          (_, i) =>
            `This is sentence number ${i} describing an aspect of the cool project's design and impact in reasonable detail.`,
        ).join(" "),
      },
    ],
    skills: [
      {
        id: "typescript",
        name: "TypeScript",
        aliases: ["ts"],
        category: "language",
        proficiency: "expert",
        evidence: [{ entityType: "experience", entityId: "acme-role", label: "Engineer, Acme" }],
      },
    ],
    gaps: [
      {
        id: "rust",
        name: "Rust",
        aliases: ["rustlang"],
        statement: "No production Rust experience.",
        relatedSkills: ["typescript"],
      },
    ],
    education: [
      {
        id: "some-degree",
        institution: "Some University",
        credential: "B.S. Engineering",
        startDate: "2015-01",
        endDate: "2019-01",
      },
    ],
    writing: [
      {
        id: "some-article",
        title: "Some Article",
        publishedDate: "2023-05-01",
        summary: "A short summary of the article.",
        url: "https://example.com/article",
        body: Array.from(
          { length: 40 },
          (_, i) =>
            `Paragraph point number ${i} makes a distinct claim about the subject matter of the article.`,
        ).join(" "),
      },
    ],
    recommendations: [
      {
        id: "recommendation-john-smith-2024",
        recommenderName: "John Smith",
        recommenderTitle: "VP of Engineering at Example Corp",
        relationship: "John was Jane's direct manager",
        date: "2024-06-15",
        text: "Jane is a fantastic engineer who ships reliable systems and mentors everyone around her.",
        recommenderProfileUrl: "https://www.linkedin.com/in/john-smith/",
        sourceUrl: "https://www.linkedin.com/in/jane-doe/details/recommendations/",
      },
    ],
    stories: [],
  };
  return { ...base, ...overrides };
}

describe("chunkCareerData — determinism", () => {
  it("produces byte-identical output (including ids and hashes) across repeated runs", () => {
    const dataset = buildDataset();
    const first = chunkCareerData(dataset);
    const second = chunkCareerData(dataset);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("chunkCareerData — isolation", () => {
  it("changing one experience entry only changes that entry's chunks", () => {
    const dataset = buildDataset();
    const before = chunkCareerData(dataset);

    const edited = buildDataset({
      experience: dataset.experience.map((entry) =>
        entry.id === "acme-role" ? { ...entry, summary: "A rewritten summary." } : entry,
      ),
    });
    const after = chunkCareerData(edited);

    const beforeById = new Map(before.map((chunk) => [chunk.id, chunk]));
    const afterById = new Map(after.map((chunk) => [chunk.id, chunk]));

    const changedSourceIds = new Set<string>();
    for (const [id, chunk] of afterById) {
      const previous = beforeById.get(id);
      if (previous === undefined || previous.contentHash !== chunk.contentHash) {
        changedSourceIds.add(chunk.sourceId);
      }
    }
    for (const [id, chunk] of beforeById) {
      if (!afterById.has(id)) {
        changedSourceIds.add(chunk.sourceId);
      }
    }

    expect(changedSourceIds).toEqual(new Set(["acme-role"]));

    // Every chunk not belonging to acme-role is byte-identical before/after.
    const untouchedBefore = before.filter((chunk) => chunk.sourceId !== "acme-role");
    const untouchedAfter = after.filter((chunk) => chunk.sourceId !== "acme-role");
    expect(untouchedAfter).toEqual(untouchedBefore);
  });
});

describe("chunkCareerData — per-entity-type coverage", () => {
  const dataset = buildDataset();
  const chunks = chunkCareerData(dataset);

  it("covers profile", () => {
    const profileChunks = chunks.filter((chunk) => chunk.sourceType === "profile");
    expect(profileChunks).toHaveLength(1);
    expect(profileChunks[0]?.text).toContain("Jane Doe");
    expect(profileChunks[0]?.citation).toMatchObject({
      entityType: "profile",
      entityId: "jane-doe",
    });
    expect(profileChunks[0]?.metadata).toEqual({});
  });

  it("covers experience", () => {
    const entryChunks = chunks.filter(
      (chunk) => chunk.sourceType === "experience" && chunk.sourceId === "acme-role",
    );
    expect(entryChunks).toHaveLength(1);
    expect(entryChunks[0]?.text).toContain("Engineer, Acme");
    expect(entryChunks[0]?.text).toContain("Shipped feature X");
    expect(entryChunks[0]?.citation).toMatchObject({
      entityType: "experience",
      entityId: "acme-role",
      label: "Engineer, Acme",
    });
    expect(entryChunks[0]?.metadata).toEqual({
      company: "Acme",
      tags: ["typescript"],
      dateFrom: "2020-01",
      dateTo: "2021-01",
    });
  });

  it("covers project (splitting its long body across multiple chunks)", () => {
    const projectChunks = chunks.filter((chunk) => chunk.sourceType === "project");
    expect(projectChunks.length).toBeGreaterThan(1);
    expect(projectChunks[0]?.text).toContain("Cool Project");
    expect(projectChunks[0]?.citation).toMatchObject({
      entityType: "project",
      entityId: "cool-project",
      url: "https://github.com/example/cool",
      fragment: "chunk-0",
    });
    expect(projectChunks[0]?.metadata).toEqual({ tags: ["python"] });
  });

  it("covers skill", () => {
    const skillChunks = chunks.filter((chunk) => chunk.sourceType === "skill");
    expect(skillChunks).toHaveLength(1);
    expect(skillChunks[0]?.text).toContain("TypeScript");
    expect(skillChunks[0]?.citation).toMatchObject({ entityType: "skill", entityId: "typescript" });
    expect(skillChunks[0]?.metadata).toEqual({ tags: ["language", "expert"] });
  });

  it("covers gap", () => {
    const gapChunks = chunks.filter((chunk) => chunk.sourceType === "gap");
    expect(gapChunks).toHaveLength(1);
    expect(gapChunks[0]?.text).toContain("not claimed");
    expect(gapChunks[0]?.citation).toMatchObject({ entityType: "gap", entityId: "rust" });
    expect(gapChunks[0]?.metadata).toEqual({ tags: ["typescript"] });
  });

  it("covers education", () => {
    const educationChunks = chunks.filter((chunk) => chunk.sourceType === "education");
    expect(educationChunks).toHaveLength(1);
    expect(educationChunks[0]?.text).toContain("B.S. Engineering");
    expect(educationChunks[0]?.citation).toMatchObject({
      entityType: "education",
      entityId: "some-degree",
    });
    expect(educationChunks[0]?.metadata).toEqual({
      company: "Some University",
      dateFrom: "2015-01",
      dateTo: "2019-01",
    });
  });

  it("covers writing (splitting its long body across multiple chunks)", () => {
    const writingChunks = chunks.filter((chunk) => chunk.sourceType === "writing");
    expect(writingChunks.length).toBeGreaterThan(1);
    expect(writingChunks[0]?.text).toContain("Some Article");
    expect(writingChunks[0]?.citation).toMatchObject({
      entityType: "writing",
      entityId: "some-article",
      url: "https://example.com/article",
      fragment: "chunk-0",
    });
    expect(writingChunks[0]?.metadata).toEqual({ dateFrom: "2023-05-01" });
  });
});

describe("chunkCareerData — max token budget and overlap over a long-prose fixture", () => {
  it("never exceeds the configured max token budget", () => {
    const dataset = buildDataset();
    const maxTokens = 60;
    const chunks = chunkCareerData(dataset, { maxTokens, overlapTokens: 10 });
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens);
    }
  });

  it("overlaps consecutive long-prose chunks from the same source by the configured amount", () => {
    const dataset = buildDataset();
    const chunks = chunkProject(dataset.projects[0] as (typeof dataset.projects)[number], {
      maxTokens: 60,
      overlapTokens: 15,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const previous = chunks[i - 1] as (typeof chunks)[number];
      const current = chunks[i] as (typeof chunks)[number];
      const firstWordOfCurrent = current.text.split(/\s+/)[0] as string;
      expect(previous.text.includes(firstWordOfCurrent)).toBe(true);
    }
  });
});

describe("chunkCareerData — citations resolve to real source records", () => {
  it("every chunk has a non-empty citation whose entityId exists in the input dataset", () => {
    const dataset = buildDataset();
    const chunks = chunkCareerData(dataset);
    const idsByType: Record<string, Set<string>> = {
      profile: new Set(dataset.profile ? [dataset.profile.id] : []),
      experience: new Set(dataset.experience.map((e) => e.id)),
      project: new Set(dataset.projects.map((p) => p.id)),
      skill: new Set(dataset.skills.map((s) => s.id)),
      gap: new Set(dataset.gaps.map((g) => g.id)),
      education: new Set(dataset.education.map((e) => e.id)),
      writing: new Set(dataset.writing.map((w) => w.id)),
      recommendation: new Set(dataset.recommendations.map((r) => r.id)),
    };

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.citation).toBeTruthy();
      expect(chunk.citation.entityId.length).toBeGreaterThan(0);
      expect(chunk.citation.label.length).toBeGreaterThan(0);
      expect(idsByType[chunk.citation.entityType]?.has(chunk.citation.entityId)).toBe(true);
      expect(chunk.citation.entityType).toBe(chunk.sourceType);
      expect(chunk.citation.entityId).toBe(chunk.sourceId);
    }
  });
});

describe("chunkCareerData — whitespace-only edits", () => {
  it("do not change contentHash", () => {
    const dataset = buildDataset();
    const before = chunkCareerData(dataset);

    const whitespaceEdited = buildDataset({
      experience: dataset.experience.map((entry) =>
        entry.id === "acme-role" ? { ...entry, summary: `${entry.summary}   \n\n\n  ` } : entry,
      ),
    });
    const after = chunkCareerData(whitespaceEdited);

    const beforeAcme = before.filter((chunk) => chunk.sourceId === "acme-role");
    const afterAcme = after.filter((chunk) => chunk.sourceId === "acme-role");
    expect(afterAcme).toEqual(beforeAcme);
  });
});

describe("chunkCareerData — snapshot", () => {
  it("matches the committed snapshot fixture", () => {
    const dataset = buildDataset();
    const chunks = chunkCareerData(dataset);
    expect(chunks).toMatchSnapshot();
  });
});

describe("per-entity helpers", () => {
  const dataset = buildDataset();

  it("chunkProfile matches chunkCareerData's profile chunk(s)", () => {
    expect(chunkProfile(dataset.profile as NonNullable<typeof dataset.profile>)).toEqual(
      chunkCareerData(dataset).filter((chunk) => chunk.sourceType === "profile"),
    );
  });

  it("chunkExperience matches chunkCareerData's chunk(s) for the same entry", () => {
    const entry = dataset.experience[0] as (typeof dataset.experience)[number];
    expect(chunkExperience(entry)).toEqual(
      chunkCareerData(dataset).filter(
        (chunk) => chunk.sourceType === "experience" && chunk.sourceId === entry.id,
      ),
    );
  });

  it("chunkGap and chunkEducation and chunkWriting produce non-empty chunks", () => {
    expect(chunkGap(dataset.gaps[0] as (typeof dataset.gaps)[number]).length).toBeGreaterThan(0);
    expect(
      chunkEducation(dataset.education[0] as (typeof dataset.education)[number]).length,
    ).toBeGreaterThan(0);
    expect(
      chunkWriting(dataset.writing[0] as (typeof dataset.writing)[number]).length,
    ).toBeGreaterThan(0);
    expect(chunkSkill(dataset.skills[0] as (typeof dataset.skills)[number]).length).toBeGreaterThan(
      0,
    );
  });
});

describe("chunkCareerData — empty dataset", () => {
  it("returns an empty array for a dataset with nothing authored", () => {
    const empty: CareerDataset = {
      profile: undefined,
      experience: [],
      projects: [],
      skills: [],
      gaps: [],
      education: [],
      writing: [],
      recommendations: [],
      stories: [],
    };
    expect(chunkCareerData(empty)).toEqual([]);
  });
});
