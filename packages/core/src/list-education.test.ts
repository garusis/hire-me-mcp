import type { EducationEntry } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listEducation } from "./list-education.js";
import { createInMemoryCareerDataRepository, emptyCareerDataset } from "./repository.js";

const inProgress: EducationEntry = {
  id: "in-progress-degree",
  institution: "Fixture University",
  credential: "B.S. Fixtureology (in progress)",
};

const completedRecent: EducationEntry = {
  id: "recent-cert",
  institution: "Fixture Institute",
  credential: "Fixture Certification",
  startDate: "2020-01",
  endDate: "2020-01",
};

const completedOld: EducationEntry = {
  id: "old-cert",
  institution: "Old Fixture Academy",
  credential: "Old Certification",
  startDate: "2015-03",
  endDate: "2015-06",
};

function fixtureRepository(
  education: EducationEntry[] = [inProgress, completedOld, completedRecent],
) {
  return createInMemoryCareerDataRepository({ ...emptyCareerDataset(), education });
}

describe("listEducation", () => {
  it("returns all entries in the documented stable order: in-progress first, then endDate descending", () => {
    const result = listEducation(fixtureRepository());

    expect(result.data.map((entry) => entry.id)).toEqual([
      "in-progress-degree",
      "recent-cert",
      "old-cert",
    ]);
  });

  it("is deterministic regardless of input array order", () => {
    const shuffled = fixtureRepository([completedRecent, inProgress, completedOld]);

    expect(listEducation(shuffled).data.map((entry) => entry.id)).toEqual([
      "in-progress-degree",
      "recent-cert",
      "old-cert",
    ]);
  });

  it("preserves optional dates exactly as authored — an in-progress entry keeps no endDate", () => {
    const result = listEducation(fixtureRepository());

    const entry = result.data.find((item) => item.id === "in-progress-degree");
    expect(entry).toBeDefined();
    expect(entry?.startDate).toBeUndefined();
    expect(entry?.endDate).toBeUndefined();
  });

  it("returns citations[i] resolving to data[i], labeled '{credential}, {institution}'", () => {
    const result = listEducation(fixtureRepository());

    expect(result.citations).toHaveLength(result.data.length);
    result.data.forEach((entry, index) => {
      expect(result.citations[index]).toEqual({
        entityType: "education",
        entityId: entry.id,
        label: `${entry.credential}, ${entry.institution}`,
      });
    });
  });

  it("returns an empty list and empty citations for an empty dataset — never throws", () => {
    const result = listEducation(fixtureRepository([]));

    expect(result.data).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
