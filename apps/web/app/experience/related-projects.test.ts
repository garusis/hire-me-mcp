import { describe, expect, it } from "vitest";
import type { ProjectListItemView } from "../../src/lib/content";
import { getExperienceListView, getProjectsListView } from "../../src/lib/content";
import { getRelatedProjects } from "./related-projects.js";

function project(
  id: string,
  tech: string[],
  period?: { start: string; end?: string },
): ProjectListItemView {
  return {
    slug: id,
    project: {
      id,
      name: id,
      summary: "s",
      role: "r",
      tech,
      links: [],
      body: "b",
      ...(period === undefined ? {} : { period }),
    },
    citation: { entityType: "project", entityId: id, label: id },
  };
}

function entry(tech: string[], startDate = "2020-01", endDate?: string) {
  return { tech, startDate, ...(endDate === undefined ? {} : { endDate }) };
}

describe("getRelatedProjects", () => {
  it("returns projects that share at least two tech tags with the experience entry", () => {
    const projects = [
      project("alpha", ["typescript", "react", "aws"]),
      project("beta", ["python"]),
    ];

    expect(getRelatedProjects(entry(["typescript", "aws"]), projects)).toEqual([projects[0]]);
  });

  it("excludes a project that shares only a single, generic tech tag — real content has every", () => {
    // TypeScript/Node role sharing "typescript" with several unrelated write-ups; a
    // single shared tag is too weak a signal to call them "related".
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects(entry(["typescript", "aws", "docker"]), projects)).toEqual([]);
  });

  it("returns an empty array when no project shares any tech tag", () => {
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects(entry(["python", "django"]), projects)).toEqual([]);
  });

  it("returns an empty array when the experience entry has no tech", () => {
    const projects = [project("alpha", ["typescript", "react"])];

    expect(getRelatedProjects(entry([]), projects)).toEqual([]);
  });

  it("preserves the projects list's own order for multiple matches", () => {
    const projects = [
      project("alpha", ["typescript", "aws"]),
      project("beta", ["typescript", "aws", "python"]),
    ];

    expect(getRelatedProjects(entry(["typescript", "aws"]), projects)).toEqual([
      projects[0],
      projects[1],
    ]);
  });

  describe("period constraint (#224)", () => {
    it("excludes a project whose declared period ends before the role started", () => {
      const projects = [project("modern", ["typescript", "nodejs"], { start: "2026-08" })];

      expect(
        getRelatedProjects(entry(["typescript", "nodejs"], "2013-02", "2015-06"), projects),
      ).toEqual([]);
    });

    it("includes a project whose declared period overlaps the role's span", () => {
      const projects = [
        project("modern", ["typescript", "nodejs"], { start: "2023-01", end: "2024-06" }),
      ];

      expect(getRelatedProjects(entry(["typescript", "nodejs"], "2022-05"), projects)).toEqual([
        projects[0],
      ]);
    });

    it("treats an open-ended project period as ongoing — it overlaps a current role", () => {
      const projects = [project("modern", ["typescript", "nodejs"], { start: "2026-08" })];

      expect(getRelatedProjects(entry(["typescript", "nodejs"], "2022-05"), projects)).toEqual([
        projects[0],
      ]);
    });

    it("keeps tag-overlap-only behavior for projects with no declared period", () => {
      const projects = [project("undated", ["typescript", "nodejs"])];

      expect(
        getRelatedProjects(entry(["typescript", "nodejs"], "2013-02", "2015-06"), projects),
      ).toEqual([projects[0]]);
    });
  });

  describe("real content (#224 regression)", () => {
    it("never relates the flagship hire-me-mcp project to a role that ended before the flagship existed", () => {
      const projects = getProjectsListView().items;
      const flagship = projects.find((item) => item.project.id === "hire-me-mcp");
      expect(flagship).toBeDefined();
      expect(flagship?.project.period).toBeDefined();

      for (const { entry: role } of getExperienceListView().items) {
        if (role.endDate !== undefined && role.endDate < "2022-01") {
          const related = getRelatedProjects(role, projects);
          expect(
            related.map((item) => item.project.id),
            `pre-2022 role "${role.company}" (${role.startDate}–${role.endDate}) must not list hire-me-mcp as related`,
          ).not.toContain("hire-me-mcp");
        }
      }
    });
  });
});
