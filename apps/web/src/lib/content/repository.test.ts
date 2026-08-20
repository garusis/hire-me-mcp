import { describe, expect, it } from "vitest";
import { getCareerDataRepository } from "./repository";

describe("getCareerDataRepository", () => {
  it("returns the same repository instance on every call (module-level memoization)", () => {
    expect(getCareerDataRepository()).toBe(getCareerDataRepository());
  });

  it("resolves the real career-data content into the dataset shape packages/core expects", () => {
    const dataset = getCareerDataRepository().getDataset();

    expect(dataset.profile).toBeDefined();
    expect(Array.isArray(dataset.experience)).toBe(true);
    expect(Array.isArray(dataset.projects)).toBe(true);
    expect(Array.isArray(dataset.skills)).toBe(true);
    expect(Array.isArray(dataset.gaps)).toBe(true);
    expect(Array.isArray(dataset.writing)).toBe(true);
  });

  it("does not re-read the content directory on repeated getDataset() calls (same object reference)", () => {
    const repository = getCareerDataRepository();

    expect(repository.getDataset()).toBe(repository.getDataset());
  });
});
