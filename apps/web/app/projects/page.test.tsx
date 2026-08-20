import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectListView } from "../../src/lib/content";

const { getProjectsListView } = vi.hoisted(() => ({ getProjectsListView: vi.fn() }));

vi.mock("../../src/lib/content", () => ({ getProjectsListView }));

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

  it("reflects the selected filter in the shareable URL of the other filter links", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "python" });

    const reactFilterLink = screen.getByRole("link", { name: "react" });
    expect(reactFilterLink).toHaveAttribute("href", "/projects?tags=python%2Creact");
  });

  it("renders the documented empty state, not a blank page, for a filter combination with no matches", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "react,python" });

    expect(screen.queryByRole("link", { name: /Alpha Project/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Beta Project/i })).toBeNull();
    expect(screen.getByText(/no projects match/i)).toBeDefined();
  });

  it("offers a way back to the unfiltered list from the empty state", async () => {
    getProjectsListView.mockReturnValue(projectsView());

    await renderProjectsPage({ tags: "react,python" });

    const clearLink = screen.getByRole("link", { name: /clear/i });
    expect(clearLink).toHaveAttribute("href", "/projects");
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
