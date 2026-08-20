import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/experience/*.json`
 * entries (#48) — one per role in the canonical career reference.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));
const experienceDir = path.join(contentDir, "experience");

interface ExperienceRecord {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  tech: string[];
}

function readExperienceEntries(): ExperienceRecord[] {
  return fs
    .readdirSync(experienceDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(experienceDir, file), "utf-8")));
}

describe("real content: experience/*.json", () => {
  it("validates every experience file against the ExperienceEntry schema", () => {
    const errors = validateContentDir(contentDir).filter((error) =>
      error.file.startsWith("experience/"),
    );
    expect(errors).toEqual([]);
  });

  it("has all seven roles from the canonical career reference, none silently dropped", () => {
    const expectedRoles = [
      { company: "House Numbers", startDate: "2022-05" },
      { company: "Xogito Group", startDate: "2020-12" },
      { company: "FullStack Labs", startDate: "2018-12" },
      { company: "Belatrix Software", startDate: "2018-07" },
      { company: "Rokk3r", startDate: "2016-02" },
      { company: "Kubesoft SAS", startDate: "2015-01" },
      { company: "Jarvi Games", startDate: "2013-02" },
    ];
    const actual = readExperienceEntries().map(({ company, startDate }) => ({
      company,
      startDate,
    }));
    expect(actual).toHaveLength(expectedRoles.length);
    for (const role of expectedRoles) {
      expect(actual).toContainEqual(role);
    }
  });

  it("has exactly one current (open-ended) role, using an omitted endDate", () => {
    const current = readExperienceEntries().filter((entry) => entry.endDate === undefined);
    expect(current).toHaveLength(1);
    expect(current[0]?.company).toBe("House Numbers");
  });

  it("every entry has a startDate matching the documented YYYY-MM format", () => {
    const entries = readExperienceEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.startDate).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });

  it("is chronologically consistent: endDate absent or >= startDate, for every entry", () => {
    for (const entry of readExperienceEntries()) {
      if (entry.endDate !== undefined) {
        expect(entry.endDate >= entry.startDate).toBe(true);
      }
    }
  });

  it("has ids matching the documented slug pattern, unique across all entries", () => {
    const ids = readExperienceEntries().map((entry) => entry.id);
    for (const id of ids) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Tech-tag vocabulary membership is a cross-entity invariant — enforced
  // once, by name, as `tag-in-vocabulary` in the #51 rule engine, and
  // asserted against this real content set in
  // src/content/real-content-lint.test.ts, rather than duplicated here.
});
