import { describe, expect, it } from "vitest";
import type { ProjectListItemView } from "../../src/lib/content";
import {
  computeTagOptions,
  filterProjectsByTags,
  parseSelectedTags,
  toggleTagHref,
} from "./filters.js";

function project(id: string, tech: string[]): ProjectListItemView {
  return {
    slug: id,
    project: { id, name: id, summary: "s", role: "r", tech, links: [], body: "b" },
    citation: { entityType: "project", entityId: id, label: id },
  };
}

describe("computeTagOptions", () => {
  it("derives sorted, de-duplicated tag options from the projects' own tech values", () => {
    const items = [project("a", ["react", "typescript"]), project("b", ["typescript", "aws"])];

    expect(computeTagOptions(items)).toEqual(["aws", "react", "typescript"]);
  });

  it("adding a tag to the stub data adds a matching option", () => {
    const withoutNewTag = computeTagOptions([project("a", ["react"])]);
    const withNewTag = computeTagOptions([project("a", ["react"]), project("b", ["rust"])]);

    expect(withoutNewTag).not.toContain("rust");
    expect(withNewTag).toContain("rust");
  });

  it("returns an empty array for no projects", () => {
    expect(computeTagOptions([])).toEqual([]);
  });
});

describe("parseSelectedTags", () => {
  it("parses a comma-separated string param into a de-duplicated tag list", () => {
    expect(parseSelectedTags("react,typescript,react")).toEqual(["react", "typescript"]);
  });

  it("parses an array param (repeated searchParams key) by flattening comma lists", () => {
    expect(parseSelectedTags(["react", "typescript,aws"])).toEqual(["react", "typescript", "aws"]);
  });

  it("returns an empty array for an undefined param", () => {
    expect(parseSelectedTags(undefined)).toEqual([]);
  });

  it("drops empty segments", () => {
    expect(parseSelectedTags("react,,typescript,")).toEqual(["react", "typescript"]);
  });
});

describe("filterProjectsByTags", () => {
  const items = [
    project("a", ["react", "typescript"]),
    project("b", ["typescript", "aws"]),
    project("c", ["python"]),
  ];

  it("returns every project unfiltered when no tags are selected", () => {
    expect(filterProjectsByTags(items, [])).toEqual(items);
  });

  it("narrows to projects that have every selected tag", () => {
    expect(filterProjectsByTags(items, ["typescript"])).toEqual([items[0], items[1]]);
  });

  it("narrows further with multiple selected tags (AND semantics)", () => {
    expect(filterProjectsByTags(items, ["typescript", "aws"])).toEqual([items[1]]);
  });

  it("returns an empty array when no project matches every selected tag", () => {
    expect(filterProjectsByTags(items, ["typescript", "python"])).toEqual([]);
  });
});

describe("toggleTagHref", () => {
  it("adds the tag to an empty selection", () => {
    expect(toggleTagHref([], "react")).toBe("/projects?tags=react");
  });

  it("adds the tag alongside already-selected tags", () => {
    expect(toggleTagHref(["react"], "aws")).toBe("/projects?tags=react%2Caws");
  });

  it("removes the tag when it is already selected", () => {
    expect(toggleTagHref(["react", "aws"], "react")).toBe("/projects?tags=aws");
  });

  it("returns the bare index path when removing the last selected tag", () => {
    expect(toggleTagHref(["react"], "react")).toBe("/projects");
  });
});
