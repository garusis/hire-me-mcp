import { buildCitation } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getProjectDetailView, getProjectsListView, listProjectSlugs } from "./projects";
import { getCareerDataRepository } from "./repository";
import { toSlug } from "./slug";

describe("getProjectsListView", () => {
  it("lists every project from the repository's dataset, passing project data through unmodified", () => {
    const repository = getCareerDataRepository();
    const expected = repository.getDataset().projects;

    const view = getProjectsListView();

    expect(view.items.map((item) => item.project)).toEqual(expected);
  });

  it("builds a citation to each project via packages/core's buildCitation", () => {
    const repository = getCareerDataRepository();

    const view = getProjectsListView();

    for (const item of view.items) {
      expect(item.citation).toEqual(buildCitation(repository, "project", item.project.id));
    }
    expect(view.citations).toEqual(view.items.map((item) => item.citation));
  });

  it("derives a stable slug for every project from its id", () => {
    const view = getProjectsListView();

    for (const item of view.items) {
      expect(item.slug).toBe(toSlug(item.project.id));
    }
  });
});

describe("listProjectSlugs", () => {
  it("returns one slug per project, for generateStaticParams", () => {
    const view = getProjectsListView();

    expect(listProjectSlugs()).toEqual(view.items.map((item) => item.slug));
  });
});

describe("getProjectDetailView", () => {
  it("returns the matching project and its citation for a known slug", () => {
    const [first] = getProjectsListView().items;
    if (first === undefined) {
      throw new Error("fixture error: expected at least one real project");
    }

    const result = getProjectDetailView(first.slug);

    expect(result).toEqual({
      found: true,
      slug: first.slug,
      value: { project: first.project, citation: first.citation },
    });
  });

  it("returns the documented not-found result for an unknown slug, rather than throwing", () => {
    const result = getProjectDetailView("no-such-project");

    expect(result).toEqual({ found: false, slug: "no-such-project" });
  });
});
