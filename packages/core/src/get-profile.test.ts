import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getProfile, ProfileNotFoundError } from "./get-profile.js";
import {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

const realContentDir = fileURLToPath(new URL("../../career-data/content/", import.meta.url));

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
  });
}

describe("getProfile", () => {
  it("returns exactly one profile record", () => {
    const result = getProfile(fixtureRepository());

    expect(result.data).toEqual({
      id: "profile-fixture",
      name: "Fixture Person",
      headline: "Fixture Engineer",
      location: "Fixtureville",
      availability: "open",
      summary: "Fixture summary.",
      contacts: [{ label: "Website", url: "https://example.test" }],
    });
  });

  it("returns a citation resolving to the profile entity", () => {
    const result = getProfile(fixtureRepository());

    expect(result.citations).toEqual([
      {
        entityType: "profile",
        entityId: "profile-fixture",
        label: "Fixture Person",
      },
    ]);
  });

  it("throws ProfileNotFoundError when the repository has no profile authored", () => {
    const repository = createInMemoryCareerDataRepository(emptyCareerDataset());

    expect(() => getProfile(repository)).toThrow(ProfileNotFoundError);
  });

  it("is deterministic: identical input yields byte-identical output across repeated calls", () => {
    const repository = fixtureRepository();

    const first = getProfile(repository);
    const second = getProfile(repository);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  describe("real content (integration)", () => {
    it("returns the real profile with a citation resolving to it", () => {
      const repository = createContentCareerDataRepository({ contentDir: realContentDir });

      const result = getProfile(repository);

      expect(result.data.id).toBe(result.citations[0]?.entityId);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.entityType).toBe("profile");
    });
  });
});
