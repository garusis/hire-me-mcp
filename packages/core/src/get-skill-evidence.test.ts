import { fileURLToPath } from "node:url";
import type { Gap, Skill } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { getSkillEvidence } from "./get-skill-evidence.js";
import {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

const realContentDir = fileURLToPath(new URL("../../career-data/content/", import.meta.url));

function skill(overrides: Partial<Skill> & Pick<Skill, "id">): Skill {
  return {
    name: overrides.id,
    aliases: [],
    category: "language",
    proficiency: "expert",
    evidence: [{ entityType: "experience", entityId: "fixture-role", label: "Fixture Role" }],
    ...overrides,
  };
}

function gap(overrides: Partial<Gap> & Pick<Gap, "id">): Gap {
  return {
    name: overrides.id,
    aliases: [],
    statement: "Fixture honest statement.",
    relatedSkills: [],
    ...overrides,
  };
}

const typescriptSkill = skill({
  id: "typescript",
  name: "TypeScript",
  aliases: ["ts"],
  evidence: [
    { entityType: "experience", entityId: "fixture-role", label: "Fixture Role, Fixture Co" },
  ],
});

const postgresqlSkill = skill({
  id: "postgresql",
  name: "PostgreSQL",
  aliases: ["postgres", "psql"],
  evidence: [
    { entityType: "experience", entityId: "fixture-role", label: "Fixture Role, Fixture Co" },
  ],
});

const golangGap = gap({
  id: "golang",
  name: "Go (Golang)",
  aliases: ["go", "golang"],
  statement:
    "No production Go experience. What transfers is a track record of getting productive fast in unfamiliar systems.",
  relatedSkills: ["typescript", "postgresql"],
});

function fixtureRepository(overrides: { skills?: Skill[]; gaps?: Gap[] } = {}) {
  return createInMemoryCareerDataRepository({
    ...emptyCareerDataset(),
    experience: [
      {
        id: "fixture-role",
        role: "Fixture Role",
        company: "Fixture Co",
        startDate: "2020-01",
        summary: "Fixture summary.",
        highlights: ["Fixture highlight."],
        tech: ["typescript"],
      },
    ],
    skills: overrides.skills ?? [typescriptSkill, postgresqlSkill],
    gaps: overrides.gaps ?? [golangGap],
  });
}

describe("getSkillEvidence", () => {
  it("returns a 'claimed' outcome for a claimed skill, with at least one resolving evidence citation", () => {
    const result = getSkillEvidence(fixtureRepository(), "typescript");

    expect(result.data.kind).toBe("claimed");
    if (result.data.kind !== "claimed") throw new Error("expected claimed");
    expect(result.data.skill.id).toBe("typescript");
    expect(result.data.skill.proficiency).toBe("expert");
    expect(result.data.evidence.length).toBeGreaterThan(0);
    for (const citation of result.data.evidence) {
      expect(citation.entityType).toBe("experience");
      expect(citation.entityId).toBe("fixture-role");
      expect(citation.label).toBe("Fixture Role, Fixture Co");
    }
    expect(result.citations).toEqual(result.data.evidence);
  });

  it("never returns 'claimed' or an empty result for a gap term — returns 'not-claimed' with the verbatim statement", () => {
    const result = getSkillEvidence(fixtureRepository(), "golang");

    expect(result.data.kind).toBe("not-claimed");
    expect(result.data.kind).not.toBe("claimed");
  });

  it("'not-claimed' carries the gap record's statement byte-identical to the authored content", () => {
    const result = getSkillEvidence(fixtureRepository(), "golang");

    if (result.data.kind !== "not-claimed") throw new Error("expected not-claimed");
    expect(result.data.gap.statement).toBe(golangGap.statement);
    expect(result.data.gap.statement).toStrictEqual(golangGap.statement);
  });

  it("'not-claimed' resolves relatedSkills to real skill records, each with its own citations", () => {
    const result = getSkillEvidence(fixtureRepository(), "golang");

    if (result.data.kind !== "not-claimed") throw new Error("expected not-claimed");
    expect(result.data.relatedSkills.length).toBeGreaterThan(0);
    const ids = result.data.relatedSkills.map((entry) => entry.skill.id);
    expect(ids).toEqual(["typescript", "postgresql"]);
    for (const entry of result.data.relatedSkills) {
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.evidence[0]?.entityType).toBe("experience");
    }
  });

  it("returns an 'unknown' outcome for an unrecognized term, distinct from 'claimed' and 'not-claimed'", () => {
    const result = getSkillEvidence(fixtureRepository(), "cobol");

    expect(result.data.kind).toBe("unknown");
    expect(result.data.kind).not.toBe("claimed");
    expect(result.data.kind).not.toBe("not-claimed");
    if (result.data.kind !== "unknown") throw new Error("expected unknown");
    expect(result.data.term).toBe("cobol");
    expect(result.citations).toEqual([]);
  });

  it("alias and case variants of a claimed skill resolve to the same skill record as the canonical name", () => {
    const repository = fixtureRepository();
    const canonical = getSkillEvidence(repository, "typescript");

    for (const variant of ["TypeScript", "  TS  ", "TYPESCRIPT", "(ts)!"]) {
      const result = getSkillEvidence(repository, variant);
      expect(result.data.kind).toBe("claimed");
      if (result.data.kind !== "claimed" || canonical.data.kind !== "claimed") {
        throw new Error("expected claimed");
      }
      expect(result.data.skill.id).toBe(canonical.data.skill.id);
    }
  });

  it("alias and case variants of a gap resolve to the same gap record as the canonical name", () => {
    const repository = fixtureRepository();
    const canonical = getSkillEvidence(repository, "golang");

    for (const variant of ["Go (Golang)", "  GO  ", "GOLANG"]) {
      const result = getSkillEvidence(repository, variant);
      expect(result.data.kind).toBe("not-claimed");
      if (result.data.kind !== "not-claimed" || canonical.data.kind !== "not-claimed") {
        throw new Error("expected not-claimed");
      }
      expect(result.data.gap.id).toBe(canonical.data.gap.id);
    }
  });

  it("is deterministic: repeated identical calls return identical output", () => {
    const repository = fixtureRepository();

    const claimedFirst = getSkillEvidence(repository, "typescript");
    const claimedSecond = getSkillEvidence(repository, "typescript");
    expect(JSON.stringify(claimedFirst)).toBe(JSON.stringify(claimedSecond));

    const gapFirst = getSkillEvidence(repository, "golang");
    const gapSecond = getSkillEvidence(repository, "golang");
    expect(JSON.stringify(gapFirst)).toBe(JSON.stringify(gapSecond));

    const unknownFirst = getSkillEvidence(repository, "cobol");
    const unknownSecond = getSkillEvidence(repository, "cobol");
    expect(JSON.stringify(unknownFirst)).toBe(JSON.stringify(unknownSecond));
  });

  describe("real content (smoke test)", () => {
    it("resolves a real claimed skill (typescript) to a 'claimed' outcome with resolving evidence", () => {
      const repository = createContentCareerDataRepository({ contentDir: realContentDir });

      const result = getSkillEvidence(repository, "typescript");

      expect(result.data.kind).toBe("claimed");
      if (result.data.kind !== "claimed") throw new Error("expected claimed");
      expect(result.data.skill.id).toBe("typescript");
      expect(result.data.evidence.length).toBeGreaterThan(0);
      expect(result.citations.length).toBe(result.data.evidence.length);
    });

    it("resolves a real gap (golang) to a 'not-claimed' outcome with the verbatim statement and relatedSkills", () => {
      const repository = createContentCareerDataRepository({ contentDir: realContentDir });

      const result = getSkillEvidence(repository, "golang");

      expect(result.data.kind).toBe("not-claimed");
      if (result.data.kind !== "not-claimed") throw new Error("expected not-claimed");
      expect(result.data.gap.id).toBe("golang");
      expect(result.data.gap.statement.length).toBeGreaterThan(0);
      expect(result.data.relatedSkills.length).toBeGreaterThan(0);
    });
  });
});
