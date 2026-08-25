import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { listRecommendationsTool } from "./list-recommendations.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listRecommendations: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listRecommendations`'s return type — see `list-recommendations.ts` for why. */
type Recommendation = ReturnType<typeof core.listRecommendations>["data"][number];

const fixtureRecommendation: Recommendation = {
  id: "recommendation-fixture-person-2024",
  recommenderName: "Fixture Person",
  recommenderTitle: "CTO at Fixture Corp",
  relationship: "Fixture Person was Marcos's direct manager",
  date: "2024-06-15",
  text: "A fixture recommendation body, verbatim.",
  recommenderProfileUrl: "https://www.linkedin.com/in/fixture-person/",
  sourceUrl: "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0",
};

const fixtureCitations: DomainResult<Recommendation[]>["citations"] = [
  {
    entityType: "recommendation",
    entityId: "recommendation-fixture-person-2024",
    label: "Recommendation from Fixture Person",
  },
];

describe("listRecommendationsTool", () => {
  beforeEach(() => {
    vi.mocked(core.listRecommendations).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listRecommendationsTool.name).toBe("list-recommendations");
    expect(listRecommendationsTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns the stubbed domain service's data unmodified (happy path)", async () => {
    const domainResult: DomainResult<Recommendation[]> = {
      data: [fixtureRecommendation],
      citations: fixtureCitations,
    };
    vi.mocked(core.listRecommendations).mockReturnValue(domainResult);
    const executor = createToolExecutor(listRecommendationsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: domainResult.citations,
    });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listRecommendations).mockReturnValue({
      data: [fixtureRecommendation],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listRecommendationsTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(fixtureCitations);
  });

  it("returns an empty list as a successful result, not an error (empty outcome)", async () => {
    vi.mocked(core.listRecommendations).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listRecommendationsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listRecommendationsTool);

    const result = await executor("not an object");

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps an unexpected handler throw to a sanitized internal_error (error outcome)", async () => {
    vi.mocked(core.listRecommendations).mockImplementation(() => {
      throw new Error("secret internal detail");
    });
    const executor = createToolExecutor(listRecommendationsTool);

    const result = await executor({});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "internal_error" });
    expect(JSON.stringify(result.structuredContent)).not.toContain("secret internal detail");
  });
});
