import { describe, expect, it } from "vitest";
import type { CareerDataset, EntitySource } from "../content/loader.js";
import {
  ALL_RULES,
  citationResolvesRule,
  gapHasStatementRule,
  gapRelatedSkillsResolveRule,
  noClaimGapCollisionRule,
  noOrphanEntitiesRule,
  runRules,
  skillHasEvidenceRule,
  tagInVocabularyRule,
  uniqueAliasesRule,
  uniqueIdsRule,
} from "./rules.js";

/**
 * A minimal, self-consistent CareerDataset + EntitySource[] that satisfies
 * every rule in this module. Individual tests clone it (structuredClone —
 * every field is plain data) and mutate exactly the field under test, so
 * each fixture is provably "everything else valid, one thing broken".
 */
function baseDataset(): CareerDataset {
  return {
    profile: {
      id: "profile-fixture",
      name: "Fixture Person",
      headline: "Fixture Headline",
      location: "Nowhere",
      availability: "open",
      summary: "Fixture summary.",
      contacts: [{ label: "Email", url: "mailto:fixture@example.com" }],
    },
    experience: [
      {
        id: "fixture-role-fixtureco-2020",
        company: "Fixtureco",
        role: "Fixture Engineer",
        startDate: "2020-01",
        summary: "Fixture role summary.",
        highlights: ["Did fixture thing one.", "Did fixture thing two."],
        tech: ["typescript"],
      },
    ],
    projects: [
      {
        id: "fixture-project",
        name: "Fixture Project",
        summary: "Fixture project summary.",
        role: "Author",
        tech: ["react"],
        links: [],
        body: "Fixture project body.",
      },
    ],
    skills: [
      {
        id: "typescript",
        name: "TypeScript",
        aliases: ["ts"],
        category: "language",
        proficiency: "expert",
        evidence: [
          {
            entityType: "experience",
            entityId: "fixture-role-fixtureco-2020",
            fragment: "highlights.0",
            label: "Fixture Engineer, Fixtureco",
          },
        ],
      },
      {
        id: "mentoring",
        name: "Mentoring",
        aliases: [],
        category: "practice",
        proficiency: "proficient",
        evidence: [
          {
            entityType: "project",
            entityId: "fixture-project",
            label: "Fixture Project",
          },
        ],
      },
    ],
    gaps: [
      {
        id: "fixture-gap",
        name: "Fixture Gap Technology",
        aliases: ["fgt"],
        statement: "Has not used the fixture gap technology.",
        relatedSkills: ["typescript"],
      },
    ],
    education: [
      {
        id: "fixture-degree-fixture-university",
        institution: "Fixture University",
        credential: "BS",
      },
    ],
    writing: [],
    recommendations: [],
  };
}

function baseSources(): EntitySource[] {
  return [
    { entityType: "profile", id: "profile-fixture", file: "profile.json" },
    {
      entityType: "experience",
      id: "fixture-role-fixtureco-2020",
      file: "experience/fixture-role.json",
    },
    { entityType: "project", id: "fixture-project", file: "projects/fixture-project.mdx" },
    { entityType: "skill", id: "typescript", file: "skills.json" },
    { entityType: "skill", id: "mentoring", file: "skills.json" },
    { entityType: "gap", id: "fixture-gap", file: "gaps.json" },
    { entityType: "education", id: "fixture-degree-fixture-university", file: "education.json" },
  ];
}

function context() {
  return { dataset: baseDataset(), sources: baseSources() };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("skill-has-evidence", () => {
  it("passes when every skill has at least one citation", () => {
    expect(skillHasEvidenceRule.check(context())).toEqual([]);
  });

  it("flags a skill with zero citations", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.evidence = clone(skill.evidence).slice(0, 0);
    const violations = skillHasEvidenceRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "skill-has-evidence",
        severity: "error",
        file: "skills.json",
        entityId: "typescript",
      }),
    ]);
  });
});

describe("citation-resolves", () => {
  it("passes when every citation resolves to an existing entity and fragment", () => {
    expect(citationResolvesRule.check(context())).toEqual([]);
  });

  it("flags a citation pointing at a nonexistent entity id", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.evidence = [
      { entityType: "experience", entityId: "does-not-exist", label: "Nonexistent" },
    ];
    const violations = citationResolvesRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "citation-resolves",
        severity: "error",
        file: "skills.json",
        entityId: "typescript",
        message: expect.stringContaining("does-not-exist"),
      }),
    ]);
  });

  it("flags a citation whose fragment does not resolve within the target entity", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.evidence = [
      {
        entityType: "experience",
        entityId: "fixture-role-fixtureco-2020",
        fragment: "highlights.99",
        label: "Fixture Engineer, Fixtureco",
      },
    ];
    const violations = citationResolvesRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "citation-resolves",
        severity: "error",
        entityId: "typescript",
        message: expect.stringContaining("highlights.99"),
      }),
    ]);
  });
});

describe("no-claim-gap-collision", () => {
  it("passes when no term is shared between a skill and a gap", () => {
    expect(noClaimGapCollisionRule.check(context())).toEqual([]);
  });

  it("flags a gap whose name collides with a skill alias, case-insensitively", () => {
    const ctx = context();
    const gap = ctx.dataset.gaps[0];
    if (gap === undefined) throw new Error("fixture gap missing");
    gap.name = "TS";
    const violations = noClaimGapCollisionRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "no-claim-gap-collision",
        severity: "error",
        file: "gaps.json",
        entityId: "fixture-gap",
      }),
    ]);
  });
});

describe("gap-has-statement", () => {
  it("passes when every gap has a non-empty statement", () => {
    expect(gapHasStatementRule.check(context())).toEqual([]);
  });

  it("flags a gap with a whitespace-only statement", () => {
    const ctx = context();
    const gap = ctx.dataset.gaps[0];
    if (gap === undefined) throw new Error("fixture gap missing");
    gap.statement = "   ";
    const violations = gapHasStatementRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "gap-has-statement",
        severity: "error",
        file: "gaps.json",
        entityId: "fixture-gap",
      }),
    ]);
  });
});

describe("gap-related-skills-resolve", () => {
  it("passes when every relatedSkills id resolves to an existing skill", () => {
    expect(gapRelatedSkillsResolveRule.check(context())).toEqual([]);
  });

  it("flags a relatedSkills id that does not resolve to any skill", () => {
    const ctx = context();
    const gap = ctx.dataset.gaps[0];
    if (gap === undefined) throw new Error("fixture gap missing");
    gap.relatedSkills = ["does-not-exist"];
    const violations = gapRelatedSkillsResolveRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "gap-related-skills-resolve",
        severity: "error",
        file: "gaps.json",
        entityId: "fixture-gap",
        message: expect.stringContaining("does-not-exist"),
      }),
    ]);
  });
});

describe("tag-in-vocabulary", () => {
  it("passes when every tech tag and technology skill id is in the controlled vocabulary", () => {
    expect(tagInVocabularyRule.check(context())).toEqual([]);
  });

  it("flags an unknown tag on an experience entry", () => {
    const ctx = context();
    const entry = ctx.dataset.experience[0];
    if (entry === undefined) throw new Error("fixture experience missing");
    entry.tech = ["not-a-real-tag"];
    const violations = tagInVocabularyRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "tag-in-vocabulary",
        severity: "error",
        file: "experience/fixture-role.json",
        entityId: "fixture-role-fixtureco-2020",
        message: expect.stringContaining("not-a-real-tag"),
      }),
    ]);
  });

  it("flags an unknown tag on a project", () => {
    const ctx = context();
    const project = ctx.dataset.projects[0];
    if (project === undefined) throw new Error("fixture project missing");
    project.tech = ["not-a-real-tag"];
    const violations = tagInVocabularyRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "tag-in-vocabulary",
        file: "projects/fixture-project.mdx",
        entityId: "fixture-project",
      }),
    ]);
  });

  it("flags a technology skill id that is not in the controlled vocabulary", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.id = "not-a-real-tag";
    const violations = tagInVocabularyRule.check(ctx);
    expect(violations.some((v) => v.entityId === "not-a-real-tag")).toBe(true);
  });

  it("exempts practice-category skills (non-technology) from vocabulary membership", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[1];
    if (skill === undefined) throw new Error("fixture skill missing");
    expect(skill.category).toBe("practice");
    expect(skill.id).toBe("mentoring");
    const violations = tagInVocabularyRule.check(ctx);
    expect(violations.some((v) => v.entityId === "mentoring")).toBe(false);
  });
});

describe("unique-ids", () => {
  it("passes when every entity id is globally unique", () => {
    expect(uniqueIdsRule.check(context())).toEqual([]);
  });

  it("flags a duplicate id shared across two entities of different types", () => {
    const ctx = context();
    const project = ctx.dataset.projects[0];
    if (project === undefined) throw new Error("fixture project missing");
    project.id = "fixture-gap";
    ctx.sources = ctx.sources.map((source) =>
      source.entityType === "project" ? { ...source, id: "fixture-gap" } : source,
    );
    const violations = uniqueIdsRule.check(ctx);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.every((v) => v.rule === "unique-ids")).toBe(true);
    expect(violations.every((v) => v.entityId === "fixture-gap")).toBe(true);
  });
});

describe("unique-aliases", () => {
  it("passes when every skill alias and every gap alias is unique within its collection", () => {
    expect(uniqueAliasesRule.check(context())).toEqual([]);
  });

  it("flags a duplicate skill alias, case-insensitively", () => {
    const ctx = context();
    const mentoring = ctx.dataset.skills[1];
    if (mentoring === undefined) throw new Error("fixture skill missing");
    mentoring.aliases = ["TS"];
    const violations = uniqueAliasesRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "unique-aliases",
        severity: "error",
        file: "skills.json",
        entityId: "mentoring",
      }),
    ]);
  });
});

describe("no-orphan-entities", () => {
  it("does not flag experience or project entries that are cited by at least one skill", () => {
    const violations = noOrphanEntitiesRule.check(context());
    expect(violations.some((v) => v.entityId === "fixture-role-fixtureco-2020")).toBe(false);
    expect(violations.some((v) => v.entityId === "fixture-project")).toBe(false);
  });

  it("warns (not errors) about an experience entry no skill cites", () => {
    const ctx = context();
    ctx.dataset.experience.push({
      id: "orphan-role-fixtureco-2021",
      company: "Fixtureco",
      role: "Orphan Engineer",
      startDate: "2021-01",
      summary: "Never cited.",
      highlights: ["Nothing cites this."],
      tech: ["typescript"],
    });
    ctx.sources.push({
      entityType: "experience",
      id: "orphan-role-fixtureco-2021",
      file: "experience/orphan-role.json",
    });
    const violations = noOrphanEntitiesRule.check(ctx);
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: "no-orphan-entities",
        severity: "warning",
        file: "experience/orphan-role.json",
        entityId: "orphan-role-fixtureco-2021",
      }),
    );
  });

  it("warns about an education entry no skill cites (education is checked too, not just experience/project)", () => {
    const ctx = context();
    const violations = noOrphanEntitiesRule.check(ctx);
    expect(violations).toEqual([
      expect.objectContaining({
        rule: "no-orphan-entities",
        severity: "warning",
        file: "education.json",
        entityId: "fixture-degree-fixture-university",
      }),
    ]);
  });

  it("does not flag profile, skills or gaps — they are roots by design, not evidence", () => {
    const violations = noOrphanEntitiesRule.check(context());
    const flaggedTypes = new Set(
      violations.map((v) =>
        v.entityId === "profile-fixture"
          ? "profile"
          : v.entityId === "typescript" || v.entityId === "mentoring"
            ? "skill"
            : v.entityId === "fixture-gap"
              ? "gap"
              : "other",
      ),
    );
    expect(flaggedTypes.has("profile")).toBe(false);
    expect(flaggedTypes.has("skill")).toBe(false);
    expect(flaggedTypes.has("gap")).toBe(false);
  });
});

describe("ALL_RULES", () => {
  it("names every rule required by #51's scope, exactly once", () => {
    const names = ALL_RULES.map((rule) => rule.name).sort();
    expect(names).toEqual(
      [
        "citation-resolves",
        "gap-has-statement",
        "gap-related-skills-resolve",
        "no-claim-gap-collision",
        "no-orphan-entities",
        "skill-has-evidence",
        "tag-in-vocabulary",
        "unique-aliases",
        "unique-ids",
      ].sort(),
    );
  });
});

describe("runRules", () => {
  it("returns no error-severity violations for a fully valid dataset (only the expected orphan-education warning)", () => {
    const violations = runRules(context());
    expect(violations.every((v) => v.severity === "warning")).toBe(true);
  });

  it("aggregates violations from every rule that fires, not just the first", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    const gap = ctx.dataset.gaps[0];
    if (skill === undefined || gap === undefined) throw new Error("fixture missing");
    skill.evidence = [
      { entityType: "experience", entityId: "does-not-exist", label: "Nonexistent" },
    ];
    gap.statement = "   ";
    const violations = runRules(ctx);
    const rules = new Set(violations.map((v) => v.rule));
    expect(rules.has("citation-resolves")).toBe(true);
    expect(rules.has("gap-has-statement")).toBe(true);
  });
});
