import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CitableEntityType } from "../schemas/index.js";
import { idSchema, isKnownTechTag } from "../schemas/index.js";
import type { CareerDataset } from "./loader.js";
import { loadContentDir, validateContentDir } from "./loader.js";

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

/**
 * Invariant tests over the skills/gaps/projects claim layer authored in #50.
 * `loadContentDir` gives us the fully schema-validated, typed dataset —
 * these tests assert the cross-entity invariants no single Zod schema can
 * express: citation resolution, alias/name collision between claimed
 * (Skill) and disclaimed (Gap) records, alias uniqueness, and tag
 * membership for the technologies actually claimed.
 */
describe("skills, gaps and projects content (#50)", () => {
  const dataset: CareerDataset = loadContentDir(contentDir);

  /** Every entity id this content set can resolve a Citation against, keyed by entityType. */
  function buildResolvers(data: CareerDataset): Record<CitableEntityType, Set<string>> {
    return {
      profile: new Set(data.profile ? [data.profile.id] : []),
      experience: new Set(data.experience.map((entry) => entry.id)),
      project: new Set(data.projects.map((project) => project.id)),
      skill: new Set(data.skills.map((skill) => skill.id)),
      gap: new Set(data.gaps.map((gap) => gap.id)),
      education: new Set(data.education.map((entry) => entry.id)),
      writing: new Set(data.writing.map((entry) => entry.id)),
    };
  }

  /** Skill ids that are not themselves a technology (soft skills / practices) — exempt from tag-vocabulary membership. */
  const NON_TECHNOLOGY_SKILL_IDS = new Set([
    "mentoring",
    "requirements-gathering",
    "regulated-data-handling",
    "mobile-hybrid",
  ]);

  /** The authoritative, closed known-gaps list from `~/.claude/career/evidence.md`. */
  const EXPECTED_GAP_IDS = [
    "golang",
    "rust",
    "java",
    "dotnet",
    "graphql",
    "mobile-native",
    "django",
    "shopify",
  ];

  describe("skills", () => {
    it("has at least one skill", () => {
      expect(dataset.skills.length).toBeGreaterThan(0);
    });

    it("every skill id is unique", () => {
      const ids = dataset.skills.map((skill) => skill.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every skill citation resolves to an existing entity of its declared type", () => {
      const resolvers = buildResolvers(dataset);
      for (const skill of dataset.skills) {
        for (const citation of skill.evidence) {
          expect(resolvers[citation.entityType].has(citation.entityId)).toBe(true);
        }
      }
    });

    it("every skill alias is unique within skills, case-insensitively", () => {
      const seen = new Set<string>();
      for (const skill of dataset.skills) {
        for (const alias of skill.aliases) {
          const key = alias.toLowerCase();
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    });

    it("every technology skill id is a member of the controlled tag vocabulary", () => {
      for (const skill of dataset.skills) {
        if (NON_TECHNOLOGY_SKILL_IDS.has(skill.id)) {
          continue;
        }
        expect(isKnownTechTag(skill.id)).toBe(true);
      }
    });
  });

  describe("gaps", () => {
    it("covers the full authoritative known-gaps list from the gap-discipline reference", () => {
      const ids = dataset.gaps.map((gap) => gap.id).sort();
      expect(ids).toEqual([...EXPECTED_GAP_IDS].sort());
    });

    it("every gap id is unique", () => {
      const ids = dataset.gaps.map((gap) => gap.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every gap alias is unique within gaps, case-insensitively", () => {
      const seen = new Set<string>();
      for (const gap of dataset.gaps) {
        for (const alias of gap.aliases) {
          const key = alias.toLowerCase();
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    });

    it("every gap has a non-empty honest statement", () => {
      for (const gap of dataset.gaps) {
        expect(gap.statement.trim().length).toBeGreaterThan(0);
      }
    });

    it("every gap's relatedSkills entry resolves to an existing Skill id", () => {
      const skillIds = new Set(dataset.skills.map((skill) => skill.id));
      for (const gap of dataset.gaps) {
        for (const relatedId of gap.relatedSkills) {
          expect(skillIds.has(relatedId)).toBe(true);
        }
      }
    });
  });

  describe("skill/gap collisions", () => {
    it("no name or alias is shared between a Skill and a Gap record, case-insensitively", () => {
      const skillTerms = new Set<string>();
      for (const skill of dataset.skills) {
        skillTerms.add(skill.name.toLowerCase());
        skillTerms.add(skill.id.toLowerCase());
        for (const alias of skill.aliases) {
          skillTerms.add(alias.toLowerCase());
        }
      }
      for (const gap of dataset.gaps) {
        const gapTerms = [gap.name, gap.id, ...gap.aliases].map((term) => term.toLowerCase());
        for (const term of gapTerms) {
          expect(skillTerms.has(term)).toBe(false);
        }
      }
    });
  });

  describe("projects", () => {
    it("has at least one project", () => {
      expect(dataset.projects.length).toBeGreaterThan(0);
    });

    it("every project id is unique", () => {
      const ids = dataset.projects.map((project) => project.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every project technology tag is a member of the controlled vocabulary", () => {
      for (const project of dataset.projects) {
        expect(project.tech.length).toBeGreaterThan(0);
        for (const tag of project.tech) {
          expect(isKnownTechTag(tag)).toBe(true);
        }
      }
    });

    it("every project has a non-empty MDX body", () => {
      for (const project of dataset.projects) {
        expect(project.body.trim().length).toBeGreaterThan(0);
      }
    });
  });
});
