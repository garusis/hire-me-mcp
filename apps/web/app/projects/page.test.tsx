import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView, ProjectListView } from "../../src/lib/content";

const { getProjectsListView, getProfileView } = vi.hoisted(() => ({
  getProjectsListView: vi.fn(),
  getProfileView: vi.fn(),
}));

vi.mock("../../src/lib/content", () => ({ getProjectsListView, getProfileView }));

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

function projectsView(): ProjectListView {
  return {
    citations: [],
    items: [
      {
        slug: "alpha-project",
        project: {
          id: "alpha-project",
          name: "Alpha Project",
          summary: "The alpha summary.",
          role: "Owner",
          tech: ["react", "typescript"],
          links: [],
          body: "b",
        },
        citation: { entityType: "project", entityId: "alpha-project", label: "Alpha Project" },
      },
      {
        slug: "beta-project",
        project: {
          id: "beta-project",
          name: "Beta Project",
          summary: "The beta summary.",
          role: "Owner",
          tech: ["python"],
          links: [],
          body: "b",
        },
        citation: { entityType: "project", entityId: "beta-project", label: "Beta Project" },
      },
    ],
  };
}

function projectsViewWithFlagship(): ProjectListView {
  const view = projectsView();
  view.items.unshift({
    slug: "flagship-project",
    project: {
      id: "flagship-project",
      name: "Flagship Project",
      summary: "The flagship summary.",
      role: "Creator and maintainer",
      tech: ["typescript"],
      links: [
        { label: "GitHub", url: "https://github.com/example/flagship" },
        { label: "Live site", url: "https://flagship.example.test" },
      ],
      body: "b",
      featured: true,
    },
    citation: { entityType: "project", entityId: "flagship-project", label: "Flagship Project" },
  });
  return view;
}

async function renderProjectsPage(searchParams: Record<string, string | string[] | undefined>) {
  const { default: ProjectsPage } = await import("./page.js");
  render(await ProjectsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Projects page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("server-renders every project from the stubbed content layer unfiltered", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({});

    expect(screen.getByRole("link", { name: /Alpha Project/i })).toHaveAttribute(
      "href",
      "/projects/alpha-project",
    );
    expect(screen.getByRole("link", { name: /Beta Project/i })).toHaveAttribute(
      "href",
      "/projects/beta-project",
    );
  });

  it("derives filter options from the stub's data — adding a tag adds an option", async () => {
    getProjectsListView.mockReturnValue(projectsView());
    await renderProjectsPage({});
    expect(screen.getByRole("link", { name: "react" })).toBeDefined();

    cleanup();
    const withNewTag = projectsView();
    const secondItem = withNewTag.items[1];
    if (secondItem === undefined) {
      throw new Error("test fixture missing item");
    }
    secondItem.project.tech = ["python", "rust"];
    getProjectsListView.mockReturnValue(withNewTag);
    await renderProjectsPage({});

    expect(screen.getByRole("link", { name: "rust" })).toBeDefined();
  });

  it("narrows the rendered set when a filter tag is selected via searchParams", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "python" });

    expect(screen.queryByRole("link", { name: /Alpha Project/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Beta Project/i })).toBeDefined();
  });

  it("marks every filter link rel=nofollow so crawlers do not walk the 2^N tag-combination URL space", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "python" });

    const filterNav = screen.getByRole("navigation", { name: "Filter projects by technology" });
    for (const link of within(filterNav).getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", expect.stringContaining("nofollow"));
    }
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "rel",
      expect.stringContaining("nofollow"),
    );
  });

  it("reflects the selected filter in the shareable URL of the other filter links", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "python" });

    const reactFilterLink = screen.getByRole("link", { name: "react" });
    expect(reactFilterLink).toHaveAttribute("href", "/projects?tags=python%2Creact");
  });

  it("renders an empty state that names the active filters and states the AND semantics (#252), not a blank page", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "react,python" });

    expect(screen.queryByRole("link", { name: /Alpha Project/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Beta Project/i })).toBeNull();
    expect(screen.getByText(/no single project uses all of the selected tags/i)).toBeDefined();
    expect(screen.getByText(/react, python/)).toBeDefined();
    expect(screen.getByText(/combine as AND/i)).toBeDefined();
  });

  it("offers a way back to the unfiltered list from the empty state", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "react,python" });

    const clearLinks = screen.getAllByRole("link", { name: /clear/i });
    for (const clearLink of clearLinks) {
      expect(clearLink).toHaveAttribute("href", "/projects");
    }
    expect(clearLinks.length).toBeGreaterThan(0);
  });

  it("shows a visible filter label rather than only an accessible nav name (#252)", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({});

    expect(screen.getByText("Filter by technology")).toBeDefined();
    expect(screen.getByText(/narrows to projects matching all of them/i)).toBeDefined();
  });

  it("calls out and ignores an unknown tag instead of silently emptying the page (#252)", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "not-a-real-tag" });

    // The unknown tag is reported…
    expect(screen.getByText(/ignored an unknown tag/i)).toBeDefined();
    expect(screen.getByText(/not-a-real-tag/)).toBeDefined();
    // …and filtering proceeds without it: the full list still renders.
    expect(screen.getByRole("link", { name: /Alpha Project/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Beta Project/i })).toBeDefined();
  });

  // Issue 274 — `?tags=TypeScript` used to return the whole unfiltered list
  // AND print a notice claiming the tag isn't one any project lists, right
  // under a chip row showing exactly that tag.
  it.each(["TypeScript", "TYPESCRIPT"])(
    "filters case-insensitively for ?tags=%s, matching the MCP server (#274)",
    async (tag) => {
      getProjectsListView.mockReturnValue(projectsView());

      await renderProjectsPage({ tags: tag });

      expect(screen.getByRole("link", { name: /Alpha Project/i })).toBeDefined();
      expect(screen.queryByRole("link", { name: /Beta Project/i })).toBeNull();
      expect(screen.queryByText(/ignored an unknown tag/i)).toBeNull();
    },
  );

  it("marks the canonical chip as selected for a differently-cased URL tag (#274)", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "TypeScript" });

    // Toggling the already-selected tag clears it, so the canonical chip's
    // href proves the page recognised the title-cased URL value.
    expect(screen.getByRole("link", { name: /^typescript/ })).toHaveAttribute("href", "/projects");
  });

  it("the unknown-tag notice claims nothing the page contradicts (#274)", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "not-a-real-tag" });

    // The old copy said the tag "isn't a technology any project here lists"
    // even when it plainly was — the notice now only ever fires for a tag
    // no project carries under case-insensitive matching, and points at the
    // chip row as the authoritative set.
    expect(screen.getByText(/no project here lists it as a technology/i)).toBeDefined();
    expect(screen.getByText(/matched regardless of capitalisation/i)).toBeDefined();
  });

  it("each project card links through to its detail route", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({});

    const alphaLink = screen.getByRole("link", { name: /Alpha Project/i });
    const card = alphaLink.closest("article");
    expect(card).not.toBeNull();
    if (card !== null) {
      expect(within(card).getByText("The alpha summary.")).toBeDefined();
    }
  });
});

describe("Projects page — flagship treatment (#191)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("marks the featured project's card as the flagship, and no other card", async () => {
    getProjectsListView.mockReturnValue(projectsViewWithFlagship());

    await renderProjectsPage({});

    const flagshipMarkers = screen.getAllByText(/flagship project of this portfolio/i);
    expect(flagshipMarkers).toHaveLength(1);
    const flagshipCard = flagshipMarkers[0]?.closest("article");
    expect(flagshipCard).not.toBeNull();
    if (flagshipCard !== null && flagshipCard !== undefined) {
      expect(within(flagshipCard).getByText("The flagship summary.")).toBeDefined();
    }
    const alphaCard = screen.getByRole("link", { name: /Alpha Project/i }).closest("article");
    if (alphaCard !== null) {
      expect(within(alphaCard).queryByText(/flagship/i)).toBeNull();
    }
  });

  it("renders the flagship card's role and external links, unlike ordinary list cards", async () => {
    getProjectsListView.mockReturnValue(projectsViewWithFlagship());

    await renderProjectsPage({});

    expect(screen.getByText("Creator and maintainer")).toBeDefined();
    expect(screen.getByRole("link", { name: /^GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/example/flagship",
    );
    expect(screen.getByRole("link", { name: /^Live site/ })).toHaveAttribute(
      "href",
      "https://flagship.example.test",
    );
  });

  it("renders no flagship marker at all when no project is featured", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({});

    expect(screen.queryByText(/flagship/i)).toBeNull();
  });

  it("keeps the flagship inside the filterable list — a tag it lacks filters it out", async () => {
    getProjectsListView.mockReturnValue(projectsViewWithFlagship());

    await renderProjectsPage({ tags: "python" });

    expect(screen.queryByText(/flagship project of this portfolio/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Beta Project/i })).toBeDefined();
  });
});

describe("Projects page metadata", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty title and a description built from the stubbed content layer", async () => {
    getProfileView.mockReturnValue(profileView());
    getProjectsListView.mockReturnValue(projectsView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toContain("Alpha Project");
    expect(metadata.description).toContain("Beta Project");
  });

  it("changing the stub's data changes the description", async () => {
    getProfileView.mockReturnValue(profileView());
    const view = projectsView();
    const firstItem = view.items[0];
    if (firstItem === undefined) {
      throw new Error("test fixture missing item");
    }
    firstItem.project.name = "Renamed Project";
    getProjectsListView.mockReturnValue(view);
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.description).toContain("Renamed Project");
  });

  it("sets a canonical URL for this route", async () => {
    getProfileView.mockReturnValue(profileView());
    getProjectsListView.mockReturnValue(projectsView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.alternates?.canonical).toBe("/projects");
  });

  it("sets Open Graph and Twitter card fields matching this route's own title/description, not the site-wide default (#38)", async () => {
    getProfileView.mockReturnValue(profileView());
    getProjectsListView.mockReturnValue(projectsView());
    const { generateMetadata } = await import("./page.js");

    const metadata = generateMetadata();

    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.openGraph?.url).toContain("/projects");
    expect(metadata.openGraph).toMatchObject({ type: "website" });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
    });
  });
});
