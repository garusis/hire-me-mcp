import { createInMemoryCareerDataRepository, emptyCareerDataset } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { listStoryParents } from "./stories";

describe("listStoryParents (#293)", () => {
  it("maps every story to its primary experience id only — never the story body, which stays off public pages", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      stories: [
        {
          id: "story-b",
          experienceId: "role-two",
          relatedExperienceIds: ["role-one"],
          title: "Story B",
          primaryCompetency: "leadership",
          supportingCompetencies: [],
          situation: "s",
          task: "t",
          actions: ["a"],
          results: ["r"],
          retrievalTags: ["fixture-tag"],
        },
        {
          id: "story-a",
          experienceId: "role-one",
          title: "Story A",
          primaryCompetency: "ownership",
          supportingCompetencies: [],
          situation: "s",
          task: "t",
          actions: ["a"],
          results: ["r"],
          retrievalTags: ["fixture-tag"],
        },
      ],
    });

    const parents = listStoryParents(repository);

    expect(parents).toEqual([
      { storyId: "story-b", experienceId: "role-two" },
      { storyId: "story-a", experienceId: "role-one" },
    ]);
    for (const parent of parents) {
      expect(Object.keys(parent).sort()).toEqual(["experienceId", "storyId"]);
    }
  });

  it("returns an empty list for a dataset with no stories", () => {
    const repository = createInMemoryCareerDataRepository(emptyCareerDataset());

    expect(listStoryParents(repository)).toEqual([]);
  });

  it("defaults to the shared real-content repository, where every authored story resolves to a parent", () => {
    const parents = listStoryParents();

    expect(parents.length).toBeGreaterThan(0);
    for (const parent of parents) {
      expect(parent.storyId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(parent.experienceId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
