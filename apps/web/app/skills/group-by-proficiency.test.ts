import { describe, expect, it } from "vitest";
import type { Skill } from "../../src/lib/content";
import { groupByProficiency } from "./group-by-proficiency";

function stubSkill(overrides: Partial<Skill>): Skill {
  return {
    id: "stub-skill",
    name: "Stub Skill",
    aliases: [],
    category: "stub-category",
    proficiency: "expert",
    evidence: [{ entityType: "project", entityId: "stub-project", label: "Stub Project" }],
    ...overrides,
  };
}

describe("groupByProficiency", () => {
  it("groups already-proficiency-sorted skills into one section per tier present, in the input order", () => {
    const expert = stubSkill({ id: "a", proficiency: "expert" });
    const proficient = stubSkill({ id: "b", proficiency: "proficient" });
    const familiar = stubSkill({ id: "c", proficiency: "familiar" });

    const groups = groupByProficiency([expert, proficient, familiar]);

    expect(groups.map((group) => group.proficiency)).toEqual(["expert", "proficient", "familiar"]);
    expect(groups[0]?.items).toEqual([expert]);
  });

  it("keeps multiple skills sharing a tier together under one group", () => {
    const first = stubSkill({ id: "a", proficiency: "expert" });
    const second = stubSkill({ id: "b", proficiency: "expert" });

    const groups = groupByProficiency([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual([first, second]);
  });

  it("omits a tier with no skills entirely, rather than rendering an empty section", () => {
    const expert = stubSkill({ id: "a", proficiency: "expert" });
    const familiar = stubSkill({ id: "b", proficiency: "familiar" });

    const groups = groupByProficiency([expert, familiar]);

    expect(groups.map((group) => group.proficiency)).toEqual(["expert", "familiar"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByProficiency([])).toEqual([]);
  });
});
