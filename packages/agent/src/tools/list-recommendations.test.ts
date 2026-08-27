import type { DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationMarkers } from "./citation-markers.js";
import { listRecommendationsInputSchema, listRecommendationsTool } from "./list-recommendations.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listRecommendations: vi.fn() };
});

/** Derived from `core.listRecommendations`'s return type — same convention as the MCP surface. */
type Recommendation = ReturnType<typeof core.listRecommendations>["data"][number];

const fixtureRecommendation: Recommendation = {
  id: "recommendation-fixture-person-2024",
  recommenderName: "Fixture Person",
  recommenderTitle: "CTO at Fixture Corp",
  relationship: "Fixture Person was Marcos's direct manager",
  date: "2024-06-15",
  text: "A fixture recommendation body.",
  recommenderProfileUrl: "https://www.linkedin.com/in/fixture-person/",
  sourceUrl: "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0",
};

describe("listRecommendationsTool", () => {
  beforeEach(() => {
    vi.mocked(core.listRecommendations).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(listRecommendationsTool.id).toBe("list-recommendations");
    expect(listRecommendationsTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's listRecommendations and returns its DomainResult with every citation marker-annotated (#270)", async () => {
    const domainResult: DomainResult<Recommendation[]> = {
      data: [fixtureRecommendation],
      citations: [
        {
          entityType: "recommendation",
          entityId: "recommendation-fixture-person-2024",
          label: "Recommendation from Fixture Person",
        },
      ],
    };
    vi.mocked(core.listRecommendations).mockReturnValue(domainResult);

    const result = await listRecommendationsTool.execute?.({}, {} as never);

    expect(core.listRecommendations).toHaveBeenCalledTimes(1);
    expect(result).toEqual(withCitationMarkers(domainResult));
  });

  it("rejects unexpected input fields (strict schema)", () => {
    const parsed = listRecommendationsInputSchema.safeParse({ unexpected: true });
    expect(parsed.success).toBe(false);
  });

  it("passes through an empty list as a successful result, not an error", async () => {
    const domainResult: DomainResult<Recommendation[]> = { data: [], citations: [] };
    vi.mocked(core.listRecommendations).mockReturnValue(domainResult);

    const result = await listRecommendationsTool.execute?.({}, {} as never);

    expect(result).toEqual(withCitationMarkers(domainResult));
  });
});
