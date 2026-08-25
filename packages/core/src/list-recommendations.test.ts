import type { Recommendation } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listRecommendations } from "./list-recommendations.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

const SOURCE_URL =
  "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0";

function makeRecommendation(overrides: Partial<Recommendation> & { id: string }): Recommendation {
  return {
    recommenderName: "Fixture Recommender",
    recommenderTitle: "CTO at Fixture Corp",
    relationship: "Fixture was Marcos's direct manager",
    date: "2024-01-15",
    text: "A fixture recommendation body.",
    recommenderProfileUrl: "https://www.linkedin.com/in/fixture/",
    sourceUrl: SOURCE_URL,
    ...overrides,
  };
}

function repositoryWith(recommendations: Recommendation[]) {
  return createInMemoryCareerDataRepository({ ...emptyCareerDataset(), recommendations });
}

describe("listRecommendations", () => {
  it("returns every recommendation, most recent first, with one citation per entry", () => {
    const older = makeRecommendation({ id: "recommendation-older", date: "2021-08-25" });
    const newer = makeRecommendation({ id: "recommendation-newer", date: "2026-08-23" });
    const result = listRecommendations(repositoryWith([older, newer]));

    expect(result.data.map((entry) => entry.id)).toEqual([
      "recommendation-newer",
      "recommendation-older",
    ]);
    expect(result.citations).toEqual([
      {
        entityType: "recommendation",
        entityId: "recommendation-newer",
        label: "Recommendation from Fixture Recommender",
      },
      {
        entityType: "recommendation",
        entityId: "recommendation-older",
        label: "Recommendation from Fixture Recommender",
      },
    ]);
  });

  it("breaks same-date ties by id ascending, so the order is fully deterministic", () => {
    const b = makeRecommendation({ id: "recommendation-b", date: "2022-03-15" });
    const a = makeRecommendation({ id: "recommendation-a", date: "2022-03-15" });
    const result = listRecommendations(repositoryWith([b, a]));

    expect(result.data.map((entry) => entry.id)).toEqual(["recommendation-a", "recommendation-b"]);
  });

  it("returns the verbatim entry — text, relationship, and both LinkedIn URLs untouched", () => {
    const entry = makeRecommendation({ id: "recommendation-verbatim" });
    const result = listRecommendations(repositoryWith([entry]));

    expect(result.data).toEqual([entry]);
  });

  it("returns an empty list and empty citations for a dataset with no recommendations — never throws", () => {
    const result = listRecommendations(repositoryWith([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("does not mutate the repository's own array while sorting", () => {
    const older = makeRecommendation({ id: "recommendation-older", date: "2021-08-25" });
    const newer = makeRecommendation({ id: "recommendation-newer", date: "2026-08-23" });
    const recommendations = [older, newer];
    listRecommendations(repositoryWith(recommendations));

    expect(recommendations.map((entry) => entry.id)).toEqual([
      "recommendation-older",
      "recommendation-newer",
    ]);
  });
});
