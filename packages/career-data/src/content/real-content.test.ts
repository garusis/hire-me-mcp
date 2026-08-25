import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
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
    // Global id uniqueness across the *whole* content set (profile,
    // experience, project, skill, gap, education, writing) is a
    // cross-entity invariant — enforced once, by name, as `unique-ids` in
    // the #51 rule engine, and asserted against this real content set in
    // src/content/real-content-lint.test.ts, rather than duplicated here
    // (this pre-#51 version only covered profile/experience/education/writing).

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

  // Tech-tag vocabulary membership for experience entries is a cross-entity
  // invariant — enforced once, by name, as `tag-in-vocabulary` in the #51
  // rule engine, and asserted against this real content set in
  // src/content/real-content-lint.test.ts, rather than duplicated here.
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

    // Citation resolution, alias uniqueness and tag-vocabulary membership for
    // skills are cross-entity invariants — enforced once, by name, in the
    // #51 rule engine (`citation-resolves`, `unique-aliases`,
    // `tag-in-vocabulary` in src/lint/rules.ts, each with its own
    // passing/failing fixture in src/lint/rules.test.ts) and asserted
    // against this real content set in src/content/real-content-lint.test.ts,
    // rather than duplicated here.
  });

  describe("gaps", () => {
    it("covers the full authoritative known-gaps list from the gap-discipline reference", () => {
      const ids = dataset.gaps.map((gap) => gap.id).sort();
      expect(ids).toEqual([...EXPECTED_GAP_IDS].sort());
    });

    // Gap id/alias uniqueness, statement presence, relatedSkills resolution,
    // and skill/gap term collision are cross-entity invariants — enforced
    // once, by name, in the #51 rule engine (`unique-ids`, `unique-aliases`,
    // `gap-has-statement`, `gap-related-skills-resolve`,
    // `no-claim-gap-collision`) and asserted against this real content set
    // in src/content/real-content-lint.test.ts, rather than duplicated here.
  });

  describe("projects", () => {
    it("has at least one project", () => {
      expect(dataset.projects.length).toBeGreaterThan(0);
    });

    // Project id uniqueness and tech-tag vocabulary membership are
    // cross-entity invariants — enforced once, by name, in the #51 rule
    // engine (`unique-ids`, `tag-in-vocabulary`) and asserted against this
    // real content set in src/content/real-content-lint.test.ts, rather
    // than duplicated here.

    it("every project has a non-empty MDX body", () => {
      for (const project of dataset.projects) {
        expect(project.body.trim().length).toBeGreaterThan(0);
      }
    });

    describe("flagship record (#191)", () => {
      it("includes hire-me-mcp itself, flagged as the featured project", () => {
        const flagship = dataset.projects.find((project) => project.id === "hire-me-mcp");
        expect(flagship).toBeDefined();
        expect(flagship?.featured).toBe(true);
      });

      it("hire-me-mcp is the only featured project — the flagship treatment is singular", () => {
        const featured = dataset.projects.filter((project) => project.featured === true);
        expect(featured.map((project) => project.id)).toEqual(["hire-me-mcp"]);
      });

      it("hire-me-mcp links to the GitHub repo, the live site, and the MCP endpoint", () => {
        const flagship = dataset.projects.find((project) => project.id === "hire-me-mcp");
        const urls = flagship?.links.map((link) => link.url) ?? [];
        expect(urls).toContain("https://github.com/garusis/hire-me-mcp");
        expect(urls).toContain("https://hire-me-mcp-web.vercel.app");
        expect(urls).toContain("https://hire-me-mcp-web.vercel.app/api/mcp");
      });

      it("hire-me-mcp documents its coding, testing and AI patterns in the body", () => {
        const flagship = dataset.projects.find((project) => project.id === "hire-me-mcp");
        const body = flagship?.body ?? "";
        expect(body).toContain("## Coding patterns");
        expect(body).toContain("## Testing patterns");
        expect(body).toContain("## AI patterns");
      });
    });
  });
});
