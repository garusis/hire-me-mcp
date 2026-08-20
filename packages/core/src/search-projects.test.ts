import type { Project, Skill } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import {
  type CareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";
import { searchProjects } from "./search-projects.js";

function project(overrides: Partial<Project> & Pick<Project, "id">): Project {
  return {
    name: "Fixture Project",
    summary: "A fixture project summary.",
    role: "Engineer",
    tech: ["typescript"],
    links: [],
    body: "Fixture body text.",
    ...overrides,
  };
}

function skill(overrides: Partial<Skill> & Pick<Skill, "id">): Skill {
  return {
    name: overrides.id,
    aliases: [],
    category: "language",
    proficiency: "expert",
    evidence: [],
    ...overrides,
  };
}

const typescriptTagProject = project({
  id: "typescript-tag-project",
  name: "Totally Unrelated Name",
  summary: "Nothing to do with the query here.",
  tech: ["typescript", "aws"],
  body: "Body text that never mentions the query term.",
});
const typescriptNameProject = project({
  id: "typescript-name-project",
  name: "TypeScript Migration Toolkit",
  summary: "An unrelated summary.",
  tech: ["nodejs"],
  body: "Body text that never mentions the query term.",
});
const typescriptSummaryProject = project({
  id: "typescript-summary-project",
  name: "Unrelated Name",
  summary: "Built primarily in TypeScript for reliability.",
  tech: ["nodejs"],
  body: "Body text that never mentions the query term.",
});
const typescriptBodyProject = project({
  id: "typescript-body-project",
  name: "Unrelated Name",
  summary: "An unrelated summary.",
  tech: ["nodejs"],
  body: "Deep in the long-form write-up, TypeScript gets one passing mention.",
});
const noMatchProject = project({
  id: "no-match-project",
  name: "Completely Different",
  summary: "Nothing relevant.",
  tech: ["php"],
  body: "No overlap with the query at all.",
});

function fixtureRepository(overrides: { projects?: Project[]; skills?: Skill[] } = {}) {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    projects: overrides.projects ?? [
      typescriptTagProject,
      typescriptNameProject,
      typescriptSummaryProject,
      typescriptBodyProject,
      noMatchProject,
    ],
    skills:
      overrides.skills ??
      ([
        skill({ id: "typescript", name: "TypeScript", aliases: ["ts"] }),
        skill({ id: "postgresql", name: "PostgreSQL", aliases: ["postgres", "psql"] }),
      ] as Skill[]),
  });
}

describe("searchProjects", () => {
  it("ranks results by the documented field weights: tag > name > summary > body", () => {
    const result = searchProjects(fixtureRepository(), "typescript");

    expect(result.data.map((r) => r.project.id)).toEqual([
      "typescript-tag-project",
      "typescript-name-project",
      "typescript-summary-project",
      "typescript-body-project",
    ]);
  });

  it("normalization: case, surrounding punctuation, diacritics and extra whitespace all resolve the same query", () => {
    const repository = fixtureRepository();
    const baseline = searchProjects(repository, "typescript");

    const variants = ["  TypeScript  ", "(TypeScript)!", "TYPESCRIPT", "Typéscript"];
    for (const variant of variants) {
      const result = searchProjects(repository, variant);
      expect(result.data.map((r) => r.project.id)).toEqual(baseline.data.map((r) => r.project.id));
    }
  });

  it("alias resolution: querying a known alias returns the same results as querying the canonical tag", () => {
    const repository = fixtureRepository();

    const canonical = searchProjects(repository, "typescript");
    const alias = searchProjects(repository, "ts");

    expect(alias.data.map((r) => r.project.id)).toEqual(canonical.data.map((r) => r.project.id));
    expect(alias.data.map((r) => r.score)).toEqual(canonical.data.map((r) => r.score));
  });

  it("tie-breaker: two equally scored results always come back in the same, documented (ascending id) order", () => {
    const zeta = project({ id: "zeta-project", tech: ["postgresql"] });
    const alpha = project({ id: "alpha-project", tech: ["postgresql"] });
    const repository = fixtureRepository({ projects: [zeta, alpha] });

    const first = searchProjects(repository, "postgresql");
    const second = searchProjects(repository, "postgresql");

    expect(first.data.map((r) => r.project.id)).toEqual(["alpha-project", "zeta-project"]);
    expect(second.data.map((r) => r.project.id)).toEqual(["alpha-project", "zeta-project"]);
  });

  it("is deterministic: the same query run repeatedly returns byte-identical results", () => {
    const repository = fixtureRepository();

    const first = searchProjects(repository, "typescript");
    const second = searchProjects(repository, "typescript");

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("an empty query returns an empty result list and empty citations, no throw", () => {
    const repository = fixtureRepository();

    expect(() => searchProjects(repository, "")).not.toThrow();
    const result = searchProjects(repository, "");

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("a whitespace-only query returns an empty result list and empty citations, no throw", () => {
    const repository = fixtureRepository();

    const result = searchProjects(repository, "   ");

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("a query matching nothing returns an empty result list and empty citations, no throw", () => {
    const repository = fixtureRepository();

    expect(() => searchProjects(repository, "cobol mainframe")).not.toThrow();
    const result = searchProjects(repository, "cobol mainframe");

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("every returned result carries at least one resolving citation, pointing at the matched project", () => {
    const result = searchProjects(fixtureRepository(), "typescript");

    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((match, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "project",
        entityId: match.project.id,
        label: match.project.name,
      });
    });
  });

  it("each result includes a machine-readable match explanation: matched field and matched token", () => {
    const result = searchProjects(fixtureRepository(), "typescript");

    const tagResult = result.data.find((r) => r.project.id === "typescript-tag-project");
    expect(tagResult?.matches).toEqual([{ field: "tag", token: "typescript" }]);

    const nameResult = result.data.find((r) => r.project.id === "typescript-name-project");
    expect(nameResult?.matches).toEqual([{ field: "name", token: "typescript" }]);
  });

  it("options.limit is respected and does not change the relative order of the results kept", () => {
    const repository = fixtureRepository();
    const unlimited = searchProjects(repository, "typescript");

    const limited = searchProjects(repository, "typescript", { limit: 2 });

    expect(limited.data).toEqual(unlimited.data.slice(0, 2));
    expect(limited.citations).toEqual(unlimited.citations.slice(0, 2));
  });

  it("options.tags pre-filters candidates before scoring (OR semantics across given tags)", () => {
    const repository = fixtureRepository();

    const result = searchProjects(repository, "typescript", { tags: ["aws"] });

    expect(result.data.map((r) => r.project.id)).toEqual(["typescript-tag-project"]);
  });

  it("options.tags resolves aliases before filtering, same as the query itself", () => {
    const repository = fixtureRepository();

    const byAlias = searchProjects(repository, "typescript", { tags: ["postgres"] });
    const byCanonical = searchProjects(repository, "typescript", { tags: ["postgresql"] });

    expect(byAlias.data).toEqual(byCanonical.data);
  });

  it("an empty repository (no projects) returns an empty result list, no throw", () => {
    const repository: CareerDataRepository = createInMemoryCareerDataRepository(
      emptyCareerDataset(),
    );

    const result = searchProjects(repository, "typescript");

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
