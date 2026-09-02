import { describe, expect, it } from "vitest";
import type { CareerDataset, EntitySource } from "../content/loader.js";
import type { LintContext } from "./rules.js";
import {
  ALL_RULES,
  citationResolvesRule,
  gapHasStatementRule,
  gapRelatedSkillsResolveRule,
  noClaimGapCollisionRule,
  noOrphanEntitiesRule,
  runRules,
  skillHasEvidenceRule,
  storyExperienceResolvesRule,
  storyPreservationMapCompleteRule,
  storyPreservationMapResolvesRule,
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
    stories: [
      {
        id: "fixture-story",
        experienceId: "fixture-role-fixtureco-2020",
        title: "Fixture story",
        primaryCompetency: "ownership",
        supportingCompetencies: ["problem-solving"],
        situation: "Fixture situation.",
        task: "Fixture task.",
        actions: ["Fixture action one.", "Fixture action two."],
        results: ["Fixture result."],
        retrievalTags: ["fixture-tag"],
      },
    ],
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
    { entityType: "story", id: "fixture-story", file: "stories/fixture-story.json" },
  ];
}

function firstStory(ctx: ReturnType<typeof context>) {
  const story = ctx.dataset.stories[0];
  if (story === undefined) throw new Error("fixture story missing");
  return story;
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

  it("resolves a citation (and its fragment) pointing at a story", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.evidence = [
      {
        entityType: "story",
        entityId: "fixture-story",
        fragment: "actions.1",
        label: "Fixture story",
      },
    ];
    expect(citationResolvesRule.check(ctx)).toEqual([]);
  });

  it("flags a story citation whose id or fragment does not resolve", () => {
    const ctx = context();
    const skill = ctx.dataset.skills[0];
    if (skill === undefined) throw new Error("fixture skill missing");
    skill.evidence = [
      { entityType: "story", entityId: "no-such-story", label: "Missing" },
      { entityType: "story", entityId: "fixture-story", fragment: "actions.9", label: "Bad" },
    ];
    const violations = citationResolvesRule.check(ctx);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.message).join("\n")).toMatch(/no-such-story/);
    expect(violations.map((v) => v.message).join("\n")).toMatch(/actions\.9/);
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

describe("story-experience-resolves", () => {
  it("passes when the primary and every related experience id resolve to real experience entries", () => {
    const ctx = context();
    ctx.dataset.experience.push({
      id: "fixture-role-otherco-2016",
      company: "Otherco",
      role: "Earlier Fixture Engineer",
      startDate: "2016-01",
      endDate: "2019-12",
      summary: "Earlier fixture role.",
      highlights: ["Did an earlier thing."],
      tech: ["typescript"],
    });
    ctx.sources.push({
      entityType: "experience",
      id: "fixture-role-otherco-2016",
      file: "experience/fixture-role-two.json",
    });
    firstStory(ctx).relatedExperienceIds = ["fixture-role-otherco-2016"];
    expect(storyExperienceResolvesRule.check(ctx)).toEqual([]);
  });

  it("passes for a story with no relatedExperienceIds at all", () => {
    expect(storyExperienceResolvesRule.check(context())).toEqual([]);
  });

  it("flags a story whose primary experienceId does not resolve, naming the story file", () => {
    const ctx = context();
    firstStory(ctx).experienceId = "does-not-exist";
    expect(storyExperienceResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: "story-experience-resolves",
        severity: "error",
        file: "stories/fixture-story.json",
        entityId: "fixture-story",
        message: expect.stringContaining("does-not-exist"),
      }),
    ]);
  });

  it("flags each related experience id that does not resolve", () => {
    const ctx = context();
    firstStory(ctx).relatedExperienceIds = ["missing-one", "missing-two"];
    const violations = storyExperienceResolvesRule.check(ctx);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.message).join("\n")).toMatch(/missing-one/);
    expect(violations.map((v) => v.message).join("\n")).toMatch(/missing-two/);
  });

  it("does not accept a story id, project id or other non-experience entity as the parent", () => {
    const ctx = context();
    firstStory(ctx).experienceId = "fixture-project";
    expect(storyExperienceResolvesRule.check(ctx)).toHaveLength(1);
  });
});

describe("unique-ids", () => {
  it("passes when every entity id is globally unique", () => {
    expect(uniqueIdsRule.check(context())).toEqual([]);
  });

  it("flags a story id that collides with another entity's id — stories participate in global uniqueness", () => {
    const ctx = context();
    firstStory(ctx).id = "fixture-project";
    ctx.sources = ctx.sources.map((source) =>
      source.entityType === "story" ? { ...source, id: "fixture-project" } : source,
    );
    const violations = uniqueIdsRule.check(ctx);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.every((v) => v.entityId === "fixture-project")).toBe(true);
    expect(violations.some((v) => v.file === "stories/fixture-story.json")).toBe(true);
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

  it("does not flag stories — a story is narrative evidence, not something a skill must cite", () => {
    const violations = noOrphanEntitiesRule.check(context());
    expect(violations.some((v) => v.entityId === "fixture-story")).toBe(false);
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

describe("story-preservation-map-resolves", () => {
  const RULE = "story-preservation-map-resolves";
  const FILE = "story-preservation-map.json";

  function mapped(entries: NonNullable<LintContext["storyPreservationMap"]>): LintContext {
    return { ...context(), storyPreservationMap: entries };
  }

  it("passes with no map at all — an absent map is nothing to check", () => {
    expect(storyPreservationMapResolvesRule.check(context())).toEqual([]);
  });

  it("passes when every entry resolves and every detailed field names an associated story", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "summary",
        classification: "role-context",
        action: "keep",
      },
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.1",
        classification: "detailed-story",
        storyIds: ["fixture-story"],
        action: "shorten",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([]);
  });

  it("flags an entry whose experience id does not resolve", () => {
    const ctx = mapped([
      {
        experienceId: "does-not-exist",
        field: "summary",
        classification: "role-context",
        action: "keep",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        severity: "error",
        file: FILE,
        entityId: "does-not-exist#summary",
        message: expect.stringContaining("does-not-exist"),
      }),
    ]);
  });

  it("flags an entry whose highlight index does not exist on the experience", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.2",
        classification: "concise-outcome",
        action: "keep",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        entityId: "fixture-role-fixtureco-2020#highlights.2",
        message: expect.stringContaining("highlights.2"),
      }),
    ]);
  });

  it("flags a story id that does not resolve", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.0",
        classification: "concise-outcome",
        storyIds: ["no-such-story"],
        action: "keep",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        entityId: "fixture-role-fixtureco-2020#highlights.0",
        message: expect.stringContaining("no-such-story"),
      }),
    ]);
  });

  it("flags a story that is neither the primary nor a related role of the field's experience — attribution never transfers (#305 point 2)", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-otherco-2016",
        field: "summary",
        classification: "role-context",
        storyIds: ["fixture-story"],
        action: "keep",
      },
    ]);
    ctx.dataset.experience.push({
      id: "fixture-role-otherco-2016",
      company: "Otherco",
      role: "Earlier Fixture Engineer",
      startDate: "2016-01",
      endDate: "2019-12",
      summary: "Earlier fixture role.",
      highlights: ["Did an earlier thing."],
      tech: ["typescript"],
    });
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        entityId: "fixture-role-otherco-2016#summary",
        message: expect.stringMatching(/fixture-story.*not associated/),
      }),
    ]);
    // A related-experience link makes the association legitimate.
    firstStory(ctx).relatedExperienceIds = ["fixture-role-otherco-2016"];
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([]);
  });

  it("flags a detailed-story field with no story — the blocking #290 evidence-preservation check", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.0",
        classification: "detailed-story",
        action: "shorten",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        severity: "error",
        file: FILE,
        entityId: "fixture-role-fixtureco-2020#highlights.0",
        message: expect.stringMatching(/detailed-story.*no story/),
      }),
    ]);
  });

  it("flags a move-detail-to-story action with no story to move the detail into", () => {
    const ctx = mapped([
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.0",
        classification: "concise-outcome",
        action: "move-detail-to-story",
      },
    ]);
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([
      expect.objectContaining({
        rule: RULE,
        entityId: "fixture-role-fixtureco-2020#highlights.0",
        message: expect.stringMatching(/move-detail-to-story.*no story/),
      }),
    ]);
  });

  it("does not require an experience to have any story or any map entry (coverage is evidence-driven, #305 point 1)", () => {
    const ctx = mapped([]);
    ctx.dataset.stories = [];
    ctx.sources = ctx.sources.filter((source) => source.entityType !== "story");
    expect(storyPreservationMapResolvesRule.check(ctx)).toEqual([]);
  });
});

describe("story-preservation-map-complete", () => {
  const RULE = "story-preservation-map-complete";
  const FILE = "story-preservation-map.json";

  function mapped(entries: NonNullable<LintContext["storyPreservationMap"]>): LintContext {
    return { ...context(), storyPreservationMap: entries };
  }

  /** Every field of the fixture experience, classified — the complete map for the base context. */
  function completeMap(): NonNullable<LintContext["storyPreservationMap"]> {
    return [
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "summary",
        classification: "role-context",
        action: "keep",
      },
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.0",
        classification: "concise-outcome",
        action: "keep",
      },
      {
        experienceId: "fixture-role-fixtureco-2020",
        field: "highlights.1",
        classification: "detailed-story",
        storyIds: ["fixture-story"],
        action: "shorten",
      },
    ];
  }

  it("passes with no map at all — an absent map is nothing to check", () => {
    expect(storyPreservationMapCompleteRule.check(context())).toEqual([]);
  });

  it("passes when every experience summary and highlight has exactly one classification", () => {
    expect(storyPreservationMapCompleteRule.check(mapped(completeMap()))).toEqual([]);
  });

  it("flags a summary that the map does not classify — a removed row is a blocking lint error, not only a Vitest invariant", () => {
    const entries = completeMap().filter((entry) => entry.field !== "summary");
    expect(storyPreservationMapCompleteRule.check(mapped(entries))).toEqual([
      expect.objectContaining({
        rule: RULE,
        severity: "error",
        file: FILE,
        entityId: "fixture-role-fixtureco-2020#summary",
        message: expect.stringMatching(/summary.*not classified/),
      }),
    ]);
  });

  it("flags a highlight that the map does not classify, naming the field so #297 cannot shorten unmapped prose", () => {
    const entries = completeMap().filter((entry) => entry.field !== "highlights.1");
    expect(storyPreservationMapCompleteRule.check(mapped(entries))).toEqual([
      expect.objectContaining({
        rule: RULE,
        severity: "error",
        file: FILE,
        entityId: "fixture-role-fixtureco-2020#highlights.1",
        message: expect.stringMatching(/highlights\.1.*not classified/),
      }),
    ]);
  });

  it("reports every missing field of every experience, not just the first", () => {
    const ctx = mapped(completeMap());
    ctx.dataset.experience.push({
      id: "fixture-role-otherco-2016",
      company: "Otherco",
      role: "Earlier Fixture Engineer",
      startDate: "2016-01",
      endDate: "2019-12",
      summary: "Earlier fixture role.",
      highlights: ["Did an earlier thing.", "Did another earlier thing."],
      tech: ["typescript"],
    });
    const ids = storyPreservationMapCompleteRule.check(ctx).map((v) => v.entityId);
    expect(ids).toEqual([
      "fixture-role-otherco-2016#summary",
      "fixture-role-otherco-2016#highlights.0",
      "fixture-role-otherco-2016#highlights.1",
    ]);
  });

  it("still does not require an experience to have a story — only a classification (#305 point 1)", () => {
    const ctx = mapped(
      completeMap().map((entry) =>
        entry.field === "highlights.1"
          ? {
              ...entry,
              classification: "concise-outcome" as const,
              storyIds: undefined,
              action: "keep" as const,
            }
          : entry,
      ),
    );
    ctx.dataset.stories = [];
    ctx.sources = ctx.sources.filter((source) => source.entityType !== "story");
    expect(storyPreservationMapCompleteRule.check(ctx)).toEqual([]);
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
        "story-experience-resolves",
        "story-preservation-map-complete",
        "story-preservation-map-resolves",
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
    firstStory(ctx).experienceId = "does-not-exist";
    const violations = runRules(ctx);
    const rules = new Set(violations.map((v) => v.rule));
    expect(rules.has("citation-resolves")).toBe(true);
    expect(rules.has("gap-has-statement")).toBe(true);
    expect(rules.has("story-experience-resolves")).toBe(true);
  });
});
