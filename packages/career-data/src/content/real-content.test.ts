import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema, isKnownTechTag } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the *real* authored content in `content/` (#48) —
 * not the synthetic fixtures under `__fixtures__/`. These assert the
 * cross-cutting rules the acceptance criteria call out that no single
 * per-file Zod schema can express on its own: id uniqueness across the
 * whole content set, date parsing + chronology, and tag vocabulary
 * membership.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));

function readJson(relPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(contentDir, relPath), "utf-8"));
}

function readJsonDir(dir: string): unknown[] {
  const dirAbs = path.join(contentDir, dir);
  if (!fs.existsSync(dirAbs)) {
    return [];
  }
  return fs
    .readdirSync(dirAbs)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(dir, file)));
}

function readMdxFrontmatterIds(dir: string): string[] {
  const dirAbs = path.join(contentDir, dir);
  if (!fs.existsSync(dirAbs)) {
    return [];
  }
  return fs
    .readdirSync(dirAbs)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dirAbs, file), "utf-8");
      const match = raw.match(/^id:\s*(\S+)\s*$/m);
      const id = match?.[1];
      if (id === undefined) {
        throw new Error(`no id frontmatter field found in ${dir}/${file}`);
      }
      return id;
    });
}

interface ExperienceRecord {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  tech: string[];
}

function readExperienceEntries(): ExperienceRecord[] {
  return readJsonDir("experience") as ExperienceRecord[];
}

interface EducationRecord {
  id: string;
  startDate?: string;
  endDate?: string;
}

function readEducationEntries(): EducationRecord[] {
  const arr = readJson("education.json");
  return (Array.isArray(arr) ? arr : []) as EducationRecord[];
}

describe("real career-data content", () => {
  it("validates cleanly under the schemas from #47", () => {
    expect(validateContentDir(contentDir)).toEqual([]);
  });

  it("has exactly one profile record", () => {
    const profile = readJson("profile.json") as { id: string };
    expect(profile.id).toBeTruthy();
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

  describe("ids", () => {
    it("are unique across the whole content set", () => {
      const ids = [
        (readJson("profile.json") as { id: string }).id,
        ...readExperienceEntries().map((entry) => entry.id),
        ...readEducationEntries().map((entry) => entry.id),
        ...readMdxFrontmatterIds("writing"),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all match the documented kebab-case slug pattern", () => {
      const ids = [
        (readJson("profile.json") as { id: string }).id,
        ...readExperienceEntries().map((entry) => entry.id),
        ...readEducationEntries().map((entry) => entry.id),
        ...readMdxFrontmatterIds("writing"),
      ];
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(idSchema.safeParse(id).success).toBe(true);
      }
    });
  });

  describe("dates", () => {
    it("every experience entry has a startDate matching YYYY-MM", () => {
      const entries = readExperienceEntries();
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.startDate).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      }
    });

    it("every experience entry is chronologically consistent (endDate absent or >= startDate)", () => {
      for (const entry of readExperienceEntries()) {
        if (entry.endDate !== undefined) {
          expect(entry.endDate >= entry.startDate).toBe(true);
        }
      }
    });

    it("every education entry with both dates present is chronologically consistent", () => {
      for (const entry of readEducationEntries()) {
        if (entry.startDate !== undefined && entry.endDate !== undefined) {
          expect(entry.endDate >= entry.startDate).toBe(true);
        }
      }
    });
  });

  it("every technology tag used in experience entries is a member of the controlled vocabulary", () => {
    const entries = readExperienceEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.tech.length).toBeGreaterThan(0);
      for (const tag of entry.tech) {
        expect(isKnownTechTag(tag)).toBe(true);
      }
    }
  });
});
