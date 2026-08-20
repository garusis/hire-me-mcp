import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`../../career-data/src/content/__fixtures__/${name}/`, import.meta.url));

describe("createInMemoryCareerDataRepository", () => {
  it("returns exactly the fixture dataset it was given, with no filesystem access", () => {
    const dataset = {
      ...emptyCareerDataset(),
      skills: [
        {
          id: "fixture-skill",
          name: "Fixture Skill",
          aliases: [],
          category: "fixture-category",
          proficiency: "expert" as const,
          evidence: [],
        },
      ],
    };
    const repository = createInMemoryCareerDataRepository(dataset);

    expect(repository.getDataset()).toBe(dataset);
  });

  it("lets a service run entirely against injected fixtures — same reference every call", () => {
    const dataset = emptyCareerDataset();
    const repository = createInMemoryCareerDataRepository(dataset);

    const runFakeService = (repo: typeof repository) => repo.getDataset().skills.length;

    expect(runFakeService(repository)).toBe(0);
    expect(runFakeService(repository)).toBe(0);
  });
});

describe("createContentCareerDataRepository", () => {
  it("loads the dataset from the given content directory", () => {
    const repository = createContentCareerDataRepository({
      contentDir: fixtureDir("valid-content"),
    });

    expect(repository.getDataset().profile?.id).toBe("profile-fixture");
  });

  it("memoizes: the content directory is read only once across repeated getDataset() calls", () => {
    const loader = vi.fn(() => emptyCareerDataset());
    const repository = createContentCareerDataRepository({
      contentDir: fixtureDir("valid-content"),
      load: loader,
    });

    repository.getDataset();
    repository.getDataset();
    repository.getDataset();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns the empty dataset for a content directory with no content authored yet, given explicit allowEmpty opt-in", () => {
    const repository = createContentCareerDataRepository({
      contentDir: fixtureDir("empty-content"),
      allowEmpty: true,
    });

    expect(repository.getDataset()).toEqual(emptyCareerDataset());
  });

  it("throws, by default, for a content directory with no content authored yet (#113 — silent-empty is a bug, not a feature)", () => {
    const repository = createContentCareerDataRepository({
      contentDir: fixtureDir("empty-content"),
    });

    expect(() => repository.getDataset()).toThrow(/no content was loaded/i);
  });
});
