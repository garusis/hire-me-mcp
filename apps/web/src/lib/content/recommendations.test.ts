import { createInMemoryCareerDataRepository, emptyCareerDataset } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getRecommendationsListView } from "./recommendations";
import { toSlug } from "./slug";

const fixtureRecommendation = {
  id: "recommendation-fixture-person-2024",
  recommenderName: "Fixture Person",
  recommenderTitle: "CTO at Fixture Corp",
  relationship: "Fixture Person was Marcos's direct manager",
  date: "2024-06-15",
  text: "A fixture recommendation body.",
  recommenderProfileUrl: "https://www.linkedin.com/in/fixture-person/",
  sourceUrl: "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0",
};

describe("getRecommendationsListView", () => {
  it("lists every recommendation from the real career-data content, most recent first", () => {
    const view = getRecommendationsListView();

    expect(view.items.length).toBeGreaterThan(0);
    const dates = view.items.map((item) => item.entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(view.citations).toEqual(view.items.map((item) => item.citation));
  });

  it("passes recommendation data through unmodified with a resolving citation per entry", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      recommendations: [fixtureRecommendation],
    });

    const view = getRecommendationsListView(repository);

    expect(view.items).toEqual([
      {
        slug: toSlug(fixtureRecommendation.id),
        entry: fixtureRecommendation,
        citation: {
          entityType: "recommendation",
          entityId: fixtureRecommendation.id,
          label: "Recommendation from Fixture Person",
        },
      },
    ]);
  });

  it("returns an empty view for a dataset with no recommendations authored", () => {
    const repository = createInMemoryCareerDataRepository(emptyCareerDataset());

    const view = getRecommendationsListView(repository);

    expect(view.items).toEqual([]);
    expect(view.citations).toEqual([]);
  });
});
