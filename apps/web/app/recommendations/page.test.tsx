import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView, RecommendationsListView } from "../../src/lib/content";

const { getRecommendationsListView, getProfileView } = vi.hoisted(() => ({
  getRecommendationsListView: vi.fn(),
  getProfileView: vi.fn(),
}));

vi.mock("../../src/lib/content", () => ({
  getRecommendationsListView,
  getProfileView,
}));

const SOURCE_URL =
  "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0";

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
      contacts: [{ label: "GitHub", url: "https://github.com/ada-fixture" }],
    },
  };
}

function recommendationsView(): RecommendationsListView {
  return {
    citations: [],
    items: [
      {
        slug: "recommendation-second-person-2026",
        entry: {
          id: "recommendation-second-person-2026",
          recommenderName: "Second Person",
          recommenderTitle: "CEO at Fixture Corp",
          relationship: "Second Person was senior to Ada but not her direct manager",
          date: "2026-08-23",
          text: "First paragraph of the second recommendation.\n\nSecond paragraph, still verbatim.",
          recommenderProfileUrl: "https://www.linkedin.com/in/second-person/",
          sourceUrl: SOURCE_URL,
        },
        citation: {
          entityType: "recommendation",
          entityId: "recommendation-second-person-2026",
          label: "Recommendation from Second Person",
        },
      },
      {
        slug: "recommendation-first-person-2022",
        entry: {
          id: "recommendation-first-person-2022",
          recommenderName: "First Person",
          recommenderTitle: "Tech Lead at Old Corp",
          relationship: "First Person was Ada's direct manager",
          date: "2022-03-15",
          text: "The first recommendation's full text.",
          recommenderProfileUrl: "https://www.linkedin.com/in/first-person/",
          sourceUrl: SOURCE_URL,
        },
        citation: {
          entityType: "recommendation",
          entityId: "recommendation-first-person-2022",
          label: "Recommendation from First Person",
        },
      },
    ],
  };
}

describe("Recommendations page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders every recommendation from the stubbed content layer, in the order returned", async () => {
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { default: RecommendationsPage } = await import("./page.js");

    render(<RecommendationsPage />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      expect.stringContaining("Second Person"),
      expect.stringContaining("First Person"),
    ]);
  });

  it("links each recommender name to their LinkedIn profile", async () => {
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { default: RecommendationsPage } = await import("./page.js");

    const { container } = render(<RecommendationsPage />);

    expect(
      container.querySelector('a[href="https://www.linkedin.com/in/second-person/"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="https://www.linkedin.com/in/first-person/"]'),
    ).not.toBeNull();
  });

  it("links every entry to the recommendations section of the LinkedIn profile for verification", async () => {
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { default: RecommendationsPage } = await import("./page.js");

    const { container } = render(<RecommendationsPage />);

    const sourceLinks = container.querySelectorAll(`a[href="${SOURCE_URL}"]`);
    // One per entry plus the intro's link to the same section.
    expect(sourceLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the relationship and date context for each entry", async () => {
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { default: RecommendationsPage } = await import("./page.js");

    render(<RecommendationsPage />);

    expect(
      screen.getByText(/Second Person was senior to Ada but not her direct manager/),
    ).toBeDefined();
    expect(screen.getByText(/First Person was Ada's direct manager/)).toBeDefined();
    expect(screen.getByText("2026-08-23")).toBeDefined();
    expect(screen.getByText("2022-03-15")).toBeDefined();
  });

  it("renders the full verbatim text, splitting paragraphs on blank lines", async () => {
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { default: RecommendationsPage } = await import("./page.js");

    render(<RecommendationsPage />);

    expect(screen.getByText("First paragraph of the second recommendation.")).toBeDefined();
    expect(screen.getByText("Second paragraph, still verbatim.")).toBeDefined();
    expect(screen.getByText("The first recommendation's full text.")).toBeDefined();
  });

  it("renders the documented empty state when no recommendations are authored", async () => {
    getRecommendationsListView.mockReturnValue({ citations: [], items: [] });
    const { default: RecommendationsPage } = await import("./page.js");

    render(<RecommendationsPage />);

    expect(screen.getByText(/No recommendations imported yet/)).toBeDefined();
  });

  it("generateMetadata names every recommender, sourced from the content layer", async () => {
    getProfileView.mockReturnValue(profileView());
    getRecommendationsListView.mockReturnValue(recommendationsView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.description).toContain("Second Person");
    expect(metadata.description).toContain("First Person");
    expect(metadata.description).toContain("Ada Fixture");
  });

  it("generateMetadata names the documented empty state when nothing is authored", async () => {
    getProfileView.mockReturnValue(profileView());
    getRecommendationsListView.mockReturnValue({ citations: [], items: [] });
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.description).toContain(
      "Ada Fixture hasn't imported any LinkedIn recommendations here yet.",
    );
  });
});
