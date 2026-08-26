import type { ExperienceEntry, Skill } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listSkills } from "./list-skills.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

const fixtureRole: ExperienceEntry = {
  id: "fixture-role",
  company: "Fixtureco",
  role: "Fixture Engineer",
  startDate: "2020-01",
  summary: "Fixture summary.",
  highlights: ["Did a fixture thing"],
  tech: ["typescript"],
};

function skill(overrides: Partial<Skill> & Pick<Skill, "id" | "name">): Skill {
  return {
    aliases: [],
    category: "language",
    proficiency: "expert",
    evidence: [{ entityType: "experience", entityId: "fixture-role", label: "stale label" }],
    ...overrides,
  };
}

const typescript = skill({ id: "typescript", name: "TypeScript" });
const react = skill({ id: "react", name: "React", category: "framework", proficiency: "expert" });
const golangAdjacent = skill({
  id: "nodejs",
  name: "Node.js",
  category: "runtime",
  proficiency: "proficient",
});
const terraform = skill({
  id: "terraform",
  name: "terraform",
  category: "cloud-infra",
  proficiency: "familiar",
});

function fixtureRepository(skills: Skill[] = [typescript, react, golangAdjacent, terraform]) {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    experience: [fixtureRole],
    skills,
  });
}

describe("listSkills", () => {
  it("with no filter, returns every skill sorted by name (case-insensitive), full records", () => {
    const result = listSkills(fixtureRepository());

    expect(result.data.map((entry) => entry.id)).toEqual([
      "nodejs",
      "react",
      "terraform",
      "typescript",
    ]);
    expect(result.data[0]).toMatchObject({
      id: "nodejs",
      name: "Node.js",
      aliases: [],
      category: "runtime",
      proficiency: "proficient",
    });
  });

  it("filters by category, exact and case-insensitive", () => {
    const result = listSkills(fixtureRepository(), { category: "Framework" });

    expect(result.data.map((entry) => entry.id)).toEqual(["react"]);
  });

  it("filters by proficiency", () => {
    const result = listSkills(fixtureRepository(), { proficiency: "familiar" });

    expect(result.data.map((entry) => entry.id)).toEqual(["terraform"]);
  });

  it("ANDs both filters together", () => {
    const both = listSkills(fixtureRepository(), { category: "language", proficiency: "expert" });
    expect(both.data.map((entry) => entry.id)).toEqual(["typescript"]);

    const contradiction = listSkills(fixtureRepository(), {
      category: "language",
      proficiency: "familiar",
    });
    expect(contradiction.data).toEqual([]);
    expect(contradiction.citations).toEqual([]);
  });

  it("an unmatched filter returns an honest empty list, not an error", () => {
    const result = listSkills(fixtureRepository(), { category: "not-a-category" });

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("resolves each record's evidence citations fresh against the dataset (not the stale authored label)", () => {
    const result = listSkills(fixtureRepository(), { category: "language" });

    expect(result.data[0]?.evidence).toEqual([
      { entityType: "experience", entityId: "fixture-role", label: "Fixture Engineer, Fixtureco" },
    ]);
  });

  it("returns citations[i] as a skill self-citation resolving to data[i]", () => {
    const result = listSkills(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((entry, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "skill",
        entityId: entry.id,
        label: entry.name,
      });
    });
  });

  it("returns an empty list for an empty dataset — never throws", () => {
    const result = listSkills(fixtureRepository([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
