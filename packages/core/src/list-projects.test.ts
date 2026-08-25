import type { Project, Skill } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listProjects } from "./list-projects.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

function project(overrides: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    summary: "Fixture summary.",
    role: "Author",
    tech: ["typescript"],
    links: [],
    body: "Fixture body prose.",
    ...overrides,
  };
}

const alpha = project({ id: "alpha-project", name: "Alpha", tech: ["typescript", "postgresql"] });
const beta = project({ id: "beta-project", name: "Beta", tech: ["react"] });
const gamma = project({ id: "gamma-project", name: "Gamma", tech: ["postgresql"] });

const postgresSkill: Skill = {
  id: "postgresql",
  name: "PostgreSQL",
  aliases: ["postgres"],
  category: "database",
  proficiency: "expert",
  evidence: [{ entityType: "project", entityId: "alpha-project", label: "Alpha" }],
};

function fixtureRepository(projects: Project[] = [gamma, alpha, beta]) {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    projects,
    skills: [postgresSkill],
  });
}

describe("listProjects", () => {
  it("with no options, returns every project in deterministic id-ascending order, full records including body", () => {
    const result = listProjects(fixtureRepository());

    expect(result.data.map((entry) => entry.id)).toEqual([
      "alpha-project",
      "beta-project",
      "gamma-project",
    ]);
    expect(result.data[0]?.body).toBe("Fixture body prose.");
  });

  it("pre-filters by tags with OR semantics", () => {
    const result = listProjects(fixtureRepository(), { tags: ["react", "postgresql"] });

    expect(result.data.map((entry) => entry.id)).toEqual([
      "alpha-project",
      "beta-project",
      "gamma-project",
    ]);

    const single = listProjects(fixtureRepository(), { tags: ["react"] });
    expect(single.data.map((entry) => entry.id)).toEqual(["beta-project"]);
  });

  it("resolves tag aliases through the skill-alias index, same as search-projects", () => {
    const result = listProjects(fixtureRepository(), { tags: ["postgres"] });

    expect(result.data.map((entry) => entry.id)).toEqual(["alpha-project", "gamma-project"]);
  });

  it("an empty tags array imposes no constraint", () => {
    const result = listProjects(fixtureRepository(), { tags: [] });

    expect(result.data).toHaveLength(3);
  });

  it("an unmatched tags filter returns an honest empty list, not an error", () => {
    const result = listProjects(fixtureRepository(), { tags: ["cobol"] });

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("returns citations[i] resolving to data[i], labeled with the project name", () => {
    const result = listProjects(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((entry, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "project",
        entityId: entry.id,
        label: entry.name,
      });
    });
  });

  it("returns an empty list for an empty dataset — never throws", () => {
    const result = listProjects(fixtureRepository([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
