import {
  buildCitation,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getGapsListView } from "./gaps";
import { getCareerDataRepository } from "./repository";

const fixtureRelatedSkill = {
  id: "fixture-related-skill",
  name: "Fixture Related Skill",
  aliases: [],
  category: "fixture-category",
  proficiency: "proficient" as const,
  evidence: [
    { entityType: "project" as const, entityId: "fixture-project", label: "Fixture Project" },
  ],
};

const fixtureProject = {
  id: "fixture-project",
  name: "Fixture Project",
  summary: "A fixture project.",
  role: "Owner",
  tech: [],
  links: [],
  body: "body",
};

const fixtureGap = {
  id: "fixture-gap",
  name: "Fixture Gap Technology",
  aliases: [],
  statement: "Has not used the fixture gap technology; this is fake data for tests only.",
  relatedSkills: ["fixture-related-skill", "unresolvable-skill-id"],
};

describe("getGapsListView", () => {
  it("lists every recorded gap from the real career-data content, each with a citation and its statement", () => {
    const view = getGapsListView();

    expect(view.items.length).toBeGreaterThan(0);
    for (const item of view.items) {
      expect(item.citation).toEqual({
        entityType: "gap",
        entityId: item.gap.id,
        label: item.gap.name,
      });
      expect(item.gap.statement.length).toBeGreaterThan(0);
    }
  });

  it("resolves each gap's relatedSkills ids to their real Skill records, dropping any that don't resolve", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      skills: [fixtureRelatedSkill],
      projects: [fixtureProject],
      gaps: [fixtureGap],
    });

    const view = getGapsListView(repository);

    expect(view.items).toEqual([
      {
        gap: fixtureGap,
        citation: buildCitation(repository, "gap", fixtureGap.id),
        relatedSkills: [fixtureRelatedSkill],
      },
    ]);
  });

  it("changing the stub's gap statement changes the rendered view — passed through unmodified, not reworded", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      gaps: [
        { ...fixtureGap, statement: "A totally different honest statement.", relatedSkills: [] },
      ],
    });

    const view = getGapsListView(repository);

    expect(view.items[0]?.gap.statement).toBe("A totally different honest statement.");
  });

  it("returns an empty relatedSkills array for a gap authored with none", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      gaps: [{ ...fixtureGap, relatedSkills: [] }],
    });

    const view = getGapsListView(repository);

    expect(view.items[0]?.relatedSkills).toEqual([]);
  });

  it("defaults to the real career-data repository when none is given", () => {
    const view = getGapsListView();

    expect(view.items.length).toBe(getCareerDataRepository().getDataset().gaps.length);
  });
});
