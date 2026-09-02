import type { CareerStoryFilter, CareerStoryListEntry, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationMarkers } from "./citation-markers.js";
import { listCareerStoriesInputSchema, listCareerStoriesTool } from "./list-career-stories.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listCareerStories: vi.fn() };
});

const fixtureEntry: CareerStoryListEntry = {
  story: {
    id: "fixture-leadership-story",
    experienceId: "fixture-role-2022",
    title: "Led a cross-team rollout under a tight deadline",
    primaryCompetency: "leadership",
    supportingCompetencies: ["ownership"],
    situation: "A fixture situation.",
    task: "A fixture task.",
    actions: ["Did the fixture action."],
    results: ["A fixture result."],
    retrievalTags: ["fixture-tag"],
  },
  primaryExperience: {
    id: "fixture-role-2022",
    company: "Fixture Corp",
    role: "Fixture Engineer",
    startDate: "2022-01",
    endDate: "2023-01",
  },
  relatedExperiences: [],
  citation: {
    entityType: "story",
    entityId: "fixture-leadership-story",
    label: "Fixture leadership story",
  },
};

describe("listCareerStoriesTool", () => {
  beforeEach(() => {
    vi.mocked(core.listCareerStories).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(listCareerStoriesTool.id).toBe("list-career-stories");
    expect(listCareerStoriesTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's listCareerStories with no input, and returns its DomainResult with every citation marker-annotated", async () => {
    const domainResult: DomainResult<CareerStoryListEntry[]> = {
      data: [fixtureEntry],
      citations: [fixtureEntry.citation],
    };
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult);

    const result = await listCareerStoriesTool.execute?.({}, {} as never);

    expect(core.listCareerStories).toHaveBeenCalledTimes(1);
    const [, calledFilter] = vi.mocked(core.listCareerStories).mock.calls[0] as [unknown, unknown];
    expect(calledFilter).toEqual({});
    expect(result).toEqual(withCitationMarkers(domainResult));
  });

  it("passes every filter field through to listCareerStories 1:1, with no reshaping", async () => {
    const domainResult: DomainResult<CareerStoryListEntry[]> = { data: [], citations: [] };
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult);

    const input = {
      id: "fixture-leadership-story",
      experienceId: "fixture-role-2022",
      company: "Fixture Corp",
      competencies: ["leadership"],
    };
    await listCareerStoriesTool.execute?.(input, {} as never);

    const [, calledFilter] = vi.mocked(core.listCareerStories).mock.calls[0] as [
      unknown,
      CareerStoryFilter,
    ];
    expect(calledFilter).toEqual(input);
  });

  it("passes through an empty list as a successful result, not an error", async () => {
    const domainResult: DomainResult<CareerStoryListEntry[]> = { data: [], citations: [] };
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult);

    const result = await listCareerStoriesTool.execute?.({}, {} as never);

    expect(result).toEqual(withCitationMarkers(domainResult));
  });

  it("carries every entry's primary and related experience context through untouched", async () => {
    const domainResult: DomainResult<CareerStoryListEntry[]> = {
      data: [fixtureEntry],
      citations: [fixtureEntry.citation],
    };
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult);

    const result = await listCareerStoriesTool.execute?.({}, {} as never);

    expect(result).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            primaryExperience: fixtureEntry.primaryExperience,
            relatedExperiences: fixtureEntry.relatedExperiences,
          }),
        ],
      }),
    );
  });

  it("rejects unexpected input fields (strict schema)", () => {
    const parsed = listCareerStoriesInputSchema.safeParse({ unexpected: true });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-array competencies value", () => {
    const parsed = listCareerStoriesInputSchema.safeParse({ competencies: "leadership" });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty object (no filter) and every field individually", () => {
    expect(listCareerStoriesInputSchema.safeParse({}).success).toBe(true);
    expect(listCareerStoriesInputSchema.safeParse({ id: "x" }).success).toBe(true);
    expect(listCareerStoriesInputSchema.safeParse({ experienceId: "x" }).success).toBe(true);
    expect(listCareerStoriesInputSchema.safeParse({ company: "x" }).success).toBe(true);
    expect(listCareerStoriesInputSchema.safeParse({ competencies: ["leadership"] }).success).toBe(
      true,
    );
  });
});
