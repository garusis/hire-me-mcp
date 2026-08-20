import { describe, expect, it } from "vitest";
import type { ProjectListItemView } from "../../src/lib/content";
import { getRelatedProjects } from "./related-projects.js";

function project(id: string, tech: string[]): ProjectListItemView {
  return {
    slug: id,
    project: { id, name: id, summary: "s", role: "r", tech, links: [], body: "b" },
    citation: { entityType: "project", entityId: id, label: id },
  };
}

describe("getRelatedProjects", () => {
  it("returns projects that share at least two tech tags with the experience entry", () => {
    const projects = [
      project("alpha", ["typescript", "react", "aws"]),
      project("beta", ["python"]),
    ];

    expect(getRelatedProjects(["typescript", "aws"], projects)).toEqual([projects[0]]);
  });

  it("excludes a project that shares only a single, generic tech tag — real content has every", () => {
    // TypeScript/Node role sharing "typescript" with several unrelated write-ups; a
    // single shared tag is too weak a signal to call them "related".
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects(["typescript", "aws", "docker"], projects)).toEqual([]);
  });

  it("returns an empty array when no project shares any tech tag", () => {
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects(["python", "django"], projects)).toEqual([]);
  });

  it("returns an empty array when the experience entry has no tech", () => {
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects([], projects)).toEqual([]);
  });

  it("preserves the projects list's own order for multiple matches", () => {
    const projects = [
      project("alpha", ["typescript", "aws"]),
      project("beta", ["typescript", "aws", "python"]),
    ];

    expect(getRelatedProjects(["typescript", "aws"], projects)).toEqual([projects[0], projects[1]]);
  });
});
