import { describe, expect, it } from "vitest";
import { buildCitation, UnknownEntityError } from "./citation-builder.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

function fixtureRepository() {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
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
});
