import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EducationListView,
  ExperienceListView,
  ProfileView,
  ProjectListView,
} from "../../src/lib/content";
import { resolveCitationHref } from "../skills/citation-href";

const { getExperienceListView, getProjectsListView, getProfileView, getEducationListView } =
  vi.hoisted(() => ({
    getExperienceListView: vi.fn(),
    getProjectsListView: vi.fn(),
    getProfileView: vi.fn(),
    getEducationListView: vi.fn(),
  }));

vi.mock("../../src/lib/content", () => ({
  getExperienceListView,
  getProjectsListView,
  getProfileView,
  getEducationListView,
}));

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

function experienceView(): ExperienceListView {
  return {
    citations: [],
    items: [
      {
        slug: "second-role",
        entry: {
          id: "second-role",
          company: "Later Co",
          role: "Staff Engineer",
          startDate: "2023-01",
          summary: "Most recent role summary.",
          highlights: ["Shipped the thing.", "Led the team."],
          tech: ["typescript", "aws"],
        },
        citation: { entityType: "experience", entityId: "second-role", label: "Later Co" },
      },
      {
        slug: "first-role",
        entry: {
          id: "first-role",
          company: "Earlier Co",
          role: "Software Engineer",
          startDate: "2019-01",
          endDate: "2022-12",
          summary: "Earlier role summary.",
          highlights: ["Built the other thing."],
          tech: ["python"],
        },
        citation: { entityType: "experience", entityId: "first-role", label: "Earlier Co" },
      },
    ],
  };
}

function projectsView(): ProjectListView {
  return {
    citations: [],
    items: [
      {
        slug: "aws-thing",
        project: {
          id: "aws-thing",
          name: "AWS Thing",
          summary: "A project.",
          role: "Owner",
          tech: ["aws", "typescript"],
          links: [],
          body: "body",
        },
        citation: { entityType: "project", entityId: "aws-thing", label: "AWS Thing" },
      },
    ],
  };
}

function educationView(): EducationListView {
  return {
    items: [
      {
        entry: {
          id: "fixture-degree",
          institution: "Fixture University",
          credential: "B.S. Fixture Studies (in progress)",
        },
        citation: {
          entityType: "education",
          entityId: "fixture-degree",
          label: "B.S. Fixture Studies (in progress), Fixture University",
        },
      },
      {
        entry: {
          id: "fixture-cert",
          institution: "Fixture Institute",
          credential: "Fixture Certification",
          startDate: "2020-01",
          endDate: "2020-06",
        },
        citation: {
          entityType: "education",
          entityId: "fixture-cert",
          label: "Fixture Certification, Fixture Institute",
        },
      },
    ],
  };
}

describe("Experience page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  beforeEach(() => {
    getEducationListView.mockReturnValue(educationView());
  });

  it("renders every experience entry from the stubbed content layer, in the order returned", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Later Co",
      "Earlier Co",
      "Education",
    ]);
  });

  it("renders an Education section from the stubbed content layer, in the order returned (#231)", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    expect(screen.getByRole("heading", { level: 2, name: "Education" })).toBeDefined();
    expect(screen.getByText("Fixture University")).toBeDefined();
    expect(screen.getByText("B.S. Fixture Studies (in progress)")).toBeDefined();
    expect(screen.getByText("Fixture Institute")).toBeDefined();
    // Authored dates render as a period; the in-progress entry with no
    // dates on record renders none rather than a fabricated one.
    expect(screen.getByText("2020-01 – 2020-06")).toBeDefined();
  });

  // Issue 227: an `[cite:education:...]` chat citation resolves to
  // `/experience#<slug>` — the anchor has to be the card that citation names,
  // or the link lands nowhere.
  it("anchors each education card at the id a citation to it resolves to (issue 227)", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    const { container } = render(await ExperiencePage());

    for (const item of educationView().items) {
      const href = resolveCitationHref(item.citation, []);
      const [, fragment] = href.split("#");
      expect(fragment, `no fragment in "${href}"`).toBeTruthy();
      expect(
        container.querySelector(`#${fragment}`),
        `no element for the "${href}" citation target`,
      ).not.toBeNull();
    }
  });

  it("renders no Education section at all when the content layer has no education records (#231)", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    getEducationListView.mockReturnValue({ items: [] });
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    expect(screen.queryByRole("heading", { level: 2, name: "Education" })).toBeNull();
  });

  it("renders company, period, summary, highlights and tech for each entry", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    expect(screen.getByText("Staff Engineer")).toBeDefined();
    expect(screen.getByText(/2023-01/)).toBeDefined();
    expect(screen.getByText(/Present/)).toBeDefined();
    expect(screen.getByText("Most recent role summary.")).toBeDefined();
    expect(screen.getByText("Shipped the thing.")).toBeDefined();
    expect(screen.getByText("Led the team.")).toBeDefined();
    expect(screen.getByText("typescript")).toBeDefined();
    expect(screen.getByText(/2019-01/)).toBeDefined();
    expect(screen.getByText(/2022-12/)).toBeDefined();
  });

  it("changing the stub's data changes the rendered output — no hardcoded career strings", async () => {
    const view = experienceView();
    const firstItem = view.items[0];
    if (firstItem === undefined) {
      throw new Error("test fixture missing item");
    }
    firstItem.entry.company = "A Totally Different Company";
    getExperienceListView.mockReturnValue(view);
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    expect(screen.getByText("A Totally Different Company")).toBeDefined();
  });

  it("links an entry to a related project sharing multiple tech tags", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    const headings = screen.getAllByRole("heading", { level: 2 });
    const laterCoHeading = headings.find((heading) => heading.textContent === "Later Co");
    if (laterCoHeading === undefined || laterCoHeading.parentElement === null) {
      throw new Error("expected Later Co entry to render");
    }
    const entryCard = laterCoHeading.parentElement;
    expect(within(entryCard).getByRole("link", { name: /AWS Thing/i })).toHaveAttribute(
      "href",
      "/projects/aws-thing",
    );
  });

  it("gives each entry card a stable id anchor matching its slug, so /skills citations can link to it", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    const { container } = render(await ExperiencePage());

    expect(container.querySelector("#second-role")).not.toBeNull();
    expect(container.querySelector("#first-role")).not.toBeNull();
  });

  it("does not render a related-projects section for an entry with no tech overlap", async () => {
    getExperienceListView.mockReturnValue(experienceView());
    getProjectsListView.mockReturnValue(projectsView());
    const { default: ExperiencePage } = await import("./page.js");

    render(await ExperiencePage());

    const headings = screen.getAllByRole("heading", { level: 2 });
    const earlierCoHeading = headings.find((heading) => heading.textContent === "Earlier Co");
    if (earlierCoHeading === undefined || earlierCoHeading.parentElement === null) {
      throw new Error("expected Earlier Co entry to render");
    }
    expect(within(earlierCoHeading.parentElement).queryByText("AWS Thing")).toBeNull();
  });
});

describe("Experience page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty title and a description built from the stubbed content layer", async () => {
    getProfileView.mockReturnValue(profileView());
    getExperienceListView.mockReturnValue(experienceView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toContain("Later Co");
    expect(metadata.description).toContain("Earlier Co");
  });

  it("changing the stub's data changes the description", async () => {
    getProfileView.mockReturnValue(profileView());
    const view = experienceView();
    const firstItem = view.items[0];
    if (firstItem === undefined) {
      throw new Error("test fixture missing item");
    }
    firstItem.entry.company = "A Totally Different Company";
    getExperienceListView.mockReturnValue(view);
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.description).toContain("A Totally Different Company");
  });

  it("sets a canonical URL for this route", async () => {
    getProfileView.mockReturnValue(profileView());
    getExperienceListView.mockReturnValue(experienceView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.alternates?.canonical).toBe("/experience");
  });

  it("sets Open Graph and Twitter card fields matching this route's own title/description, not the site-wide default (#38)", async () => {
    getProfileView.mockReturnValue(profileView());
    getExperienceListView.mockReturnValue(experienceView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.openGraph?.url).toContain("/experience");
    expect(metadata.openGraph).toMatchObject({ type: "website" });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
    });
  });
});
