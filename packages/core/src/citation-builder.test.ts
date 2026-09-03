import { type CitableEntityType, citableEntityTypeSchema } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { buildCitation, UnknownEntityError } from "./citation-builder.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

/** One real entity per citable type, so every branch of the builder's lookup can be exercised. */
const FIXTURE_IDS: Record<CitableEntityType, string> = {
  profile: "profile-fixture",
  experience: "fixture-role-fixtureco-2020",
  project: "fixture-project",
  skill: "fixture-skill",
  gap: "fixture-gap",
  education: "fixture-degree",
  writing: "fixture-article",
  recommendation: "fixture-recommendation",
  story: "fixture-story",
};

function fixtureRepository() {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    projects: [
      {
        id: FIXTURE_IDS.project,
        name: "Fixture Project",
        summary: "Fixture project summary.",
        role: "Author",
        tech: ["typescript"],
        links: [],
        body: "Fixture body.",
      },
    ],
    gaps: [
      {
        id: FIXTURE_IDS.gap,
        name: "Fixture Gap",
        aliases: [],
        statement: "Has not used it.",
        relatedSkills: [],
      },
    ],
    education: [{ id: FIXTURE_IDS.education, institution: "Fixture University", credential: "BS" }],
    writing: [
      {
        id: FIXTURE_IDS.writing,
        title: "Fixture Article",
        publishedDate: "2024-01-01",
        summary: "Fixture article summary.",
        body: "Fixture article body.",
      },
    ],
    recommendations: [
      {
        id: FIXTURE_IDS.recommendation,
        recommenderName: "Jane Doe",
        recommenderTitle: "CTO",
        relationship: "Jane managed Marcos",
        date: "2026-01-01",
        text: "Great engineer.",
        recommenderProfileUrl: "https://www.linkedin.com/in/jane-doe/",
        sourceUrl: "https://www.linkedin.com/in/garusis/details/recommendations/",
      },
    ],
    stories: [
      {
        id: FIXTURE_IDS.story,
        experienceId: FIXTURE_IDS.experience,
        title: "Recovered a failing client account",
        primaryCompetency: "leadership",
        supportingCompetencies: ["stakeholder-management"],
        situation: "Fixture situation.",
        task: "Fixture task.",
        actions: ["Fixture action."],
        results: ["Fixture result."],
        retrievalTags: ["client-recovery"],
      },
    ],
    profile: {
      id: "profile-fixture",
      name: "Fixture Person",
      headline: "Fixture Engineer",
      location: "Fixtureville",
      availability: "open",
      summary: "Fixture summary.",
      contacts: [{ label: "Website", url: "https://example.test" }],
    },
    experience: [
      {
        id: "fixture-role-fixtureco-2020",
        company: "Fixtureco",
        role: "Fixture Engineer",
        startDate: "2020-01",
        endDate: "2022-01",
        summary: "Fixture summary.",
        highlights: ["Did a fixture thing"],
        tech: ["fixture-lang"],
      },
    ],
    skills: [
      {
        id: "fixture-skill",
        name: "Fixture Skill",
        aliases: [],
        category: "fixture-category",
        proficiency: "expert",
        evidence: [],
      },
    ],
  });
}

describe("buildCitation", () => {
  it("resolves a citation to a real entity, deriving a human-readable label", () => {
    const citation = buildCitation(fixtureRepository(), "skill", "fixture-skill");

    expect(citation).toEqual({
      entityType: "skill",
      entityId: "fixture-skill",
      label: "Fixture Skill",
    });
  });

  it("derives a role/company label for an experience entity", () => {
    const citation = buildCitation(
      fixtureRepository(),
      "experience",
      "fixture-role-fixtureco-2020",
    );

    expect(citation).toEqual({
      entityType: "experience",
      entityId: "fixture-role-fixtureco-2020",
      label: "Fixture Engineer, Fixtureco",
    });
  });

  it("resolves the singleton profile entity by id", () => {
    const citation = buildCitation(fixtureRepository(), "profile", "profile-fixture");

    expect(citation).toEqual({
      entityType: "profile",
      entityId: "profile-fixture",
      label: "Fixture Person",
    });
  });

  it("accepts an explicit fragment addressing a sub-part of the entity", () => {
    const citation = buildCitation(fixtureRepository(), "skill", "fixture-skill", {
      fragment: "evidence.0",
    });

    expect(citation.fragment).toBe("evidence.0");
  });

  it("accepts an explicit label override instead of the derived one", () => {
    const citation = buildCitation(fixtureRepository(), "skill", "fixture-skill", {
      label: "Custom label",
    });

    expect(citation.label).toBe("Custom label");
  });

  it("throws UnknownEntityError for an entity id that does not exist in the dataset", () => {
    expect(() => buildCitation(fixtureRepository(), "skill", "nonexistent-skill")).toThrow(
      UnknownEntityError,
    );
  });

  it("names the entity type and id on the failure", () => {
    try {
      buildCitation(fixtureRepository(), "gap", "nonexistent-gap");
      expect.unreachable("expected buildCitation to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownEntityError);
      expect((error as UnknownEntityError).entityType).toBe("gap");
      expect((error as UnknownEntityError).entityId).toBe("nonexistent-gap");
      expect((error as Error).message).toMatch(/gap/);
      expect((error as Error).message).toMatch(/nonexistent-gap/);
    }
  });

  it("throws UnknownEntityError when the profile id does not match the loaded singleton", () => {
    expect(() => buildCitation(fixtureRepository(), "profile", "someone-else")).toThrow(
      UnknownEntityError,
    );
  });

  it("resolves a story citation by id and labels it with the story's title (#289)", () => {
    const citation = buildCitation(fixtureRepository(), "story", "fixture-story");

    expect(citation).toEqual({
      entityType: "story",
      entityId: "fixture-story",
      label: "Recovered a failing client account",
    });
  });

  it("throws UnknownEntityError for a story id that does not exist", () => {
    expect(() => buildCitation(fixtureRepository(), "story", "no-such-story")).toThrow(
      UnknownEntityError,
    );
  });

  describe("exhaustive citable-entity coverage", () => {
    it.each(citableEntityTypeSchema.options)(
      "resolves a real %s entity with a non-empty derived label and rejects an unknown id",
      (entityType) => {
        const citation = buildCitation(fixtureRepository(), entityType, FIXTURE_IDS[entityType]);
        expect(citation.entityType).toBe(entityType);
        expect(citation.entityId).toBe(FIXTURE_IDS[entityType]);
        expect(citation.label.length).toBeGreaterThan(0);

        expect(() => buildCitation(fixtureRepository(), entityType, "no-such-entity")).toThrow(
          UnknownEntityError,
        );
      },
    );

    it("keys the fixture by exactly the citable-entity enum, so a new entity type fails here first", () => {
      expect(Object.keys(FIXTURE_IDS).sort()).toEqual([...citableEntityTypeSchema.options].sort());
    });
  });
});
