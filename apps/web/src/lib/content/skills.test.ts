import { getSkillEvidence } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getCareerDataRepository } from "./repository";
import { getSkillEvidenceView, getSkillsListView } from "./skills";

const PROFICIENCY_RANK: Record<"expert" | "proficient" | "familiar", number> = {
  expert: 0,
  proficient: 1,
  familiar: 2,
};

describe("getSkillEvidenceView", () => {
  it("passes a claimed skill outcome through unmodified", () => {
    const expected = getSkillEvidence(getCareerDataRepository(), "typescript");

    const view = getSkillEvidenceView("typescript");

    expect(view.outcome).toEqual(expected.data);
    expect(view.outcome.kind).toBe("claimed");
    expect(view.citations).toEqual(expected.citations);
  });

  it("faithfully surfaces the not-claimed (gap) outcome, including the honest gap statement, unmodified", () => {
    const expected = getSkillEvidence(getCareerDataRepository(), "golang");

    const view = getSkillEvidenceView("golang");

    expect(view.outcome).toEqual(expected.data);
    expect(view.outcome.kind).toBe("not-claimed");
    if (view.outcome.kind === "not-claimed") {
      expect(view.outcome.gap.statement).toBe(
        expected.data.kind === "not-claimed" ? expected.data.gap.statement : undefined,
      );
    }
    expect(view.citations).toEqual(expected.citations);
  });

  it("returns the unknown outcome for a term matching neither a claimed skill nor a recorded gap", () => {
    const view = getSkillEvidenceView("some-term-nobody-authored");

    expect(view.outcome).toEqual({ kind: "unknown", term: "some-term-nobody-authored" });
    expect(view.citations).toEqual([]);
  });
});

describe("getSkillsListView", () => {
  it("returns every skill authored in the dataset", () => {
    const datasetSkills = getCareerDataRepository().getDataset().skills;

    const view = getSkillsListView();

    expect(view.items).toHaveLength(datasetSkills.length);
  });

  it("orders skills by proficiency — expert first, then proficient, then familiar", () => {
    const view = getSkillsListView();

    const ranks = view.items.map((skill) => PROFICIENCY_RANK[skill.proficiency]);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sortedRanks);
  });

  it("does not mutate the underlying dataset's authored order", () => {
    const before = getCareerDataRepository()
      .getDataset()
      .skills.map((skill) => skill.id);

    getSkillsListView();

    const after = getCareerDataRepository()
      .getDataset()
      .skills.map((skill) => skill.id);
    expect(after).toEqual(before);
  });

  it("includes the known-expert TypeScript skill ahead of a known-familiar skill like PHP", () => {
    const view = getSkillsListView();

    const typescriptIndex = view.items.findIndex((skill) => skill.id === "typescript");
    const phpIndex = view.items.findIndex((skill) => skill.id === "php");

    expect(typescriptIndex).toBeGreaterThanOrEqual(0);
    expect(phpIndex).toBeGreaterThanOrEqual(0);
    expect(typescriptIndex).toBeLessThan(phpIndex);
  });
});
