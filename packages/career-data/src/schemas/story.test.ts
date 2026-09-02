import { describe, expect, it } from "vitest";
import { COMPETENCIES } from "./competency.js";
import { careerStorySchema } from "./story.js";

const validStory = {
  id: "fixture-story-outage-recovery",
  experienceId: "fixture-role-fixtureco-2020",
  relatedExperienceIds: ["fixture-role-otherco-2016"],
  title: "Recovered a failing client account",
  primaryCompetency: "leadership",
  supportingCompetencies: ["stakeholder-management", "collaboration"],
  situation: "The client was about to churn after repeated missed deadlines.",
  task: "Own the recovery plan and rebuild trust within one quarter.",
  actions: ["Audited every open commitment.", "Set up a weekly stakeholder review."],
  results: ["The client renewed for another year.", "Delivery predictability improved."],
  reflection: "Escalate earlier next time.",
  retrievalTags: ["client-recovery", "account-management", "weekly-review"],
};

function parse(overrides: Record<string, unknown>) {
  return careerStorySchema.safeParse({ ...validStory, ...overrides });
}

function without(key: keyof typeof validStory) {
  const { [key]: _omitted, ...rest } = validStory;
  return careerStorySchema.safeParse(rest);
}

function issuePaths(result: ReturnType<typeof careerStorySchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("careerStorySchema — valid shapes", () => {
  it("accepts a fully-populated story", () => {
    expect(careerStorySchema.safeParse(validStory).success).toBe(true);
  });

  it("accepts a story that omits relatedExperienceIds and reflection", () => {
    expect(without("relatedExperienceIds").success).toBe(true);
    expect(without("reflection").success).toBe(true);
  });

  it("accepts multiple distinct related experience ids", () => {
    const result = parse({
      relatedExperienceIds: ["fixture-role-fixtureco-2018", "fixture-role-otherco-2016"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero supporting competencies and up to five", () => {
    expect(parse({ supportingCompetencies: [] }).success).toBe(true);
    expect(
      parse({
        supportingCompetencies: [
          "adaptability",
          "collaboration",
          "communication",
          "customer-focus",
          "decision-making",
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts exactly fifteen distinct retrieval tags", () => {
    const tags = Array.from({ length: 15 }, (_, index) => `tag-${index}`);
    expect(parse({ retrievalTags: tags }).success).toBe(true);
  });

  it("does not transform retrievalTags — what is persisted is what is parsed", () => {
    const result = careerStorySchema.safeParse(validStory);
    expect(result.success && result.data.retrievalTags).toEqual(validStory.retrievalTags);
  });
});

describe("careerStorySchema — required narrative fields", () => {
  it.each(["id", "experienceId", "title", "primaryCompetency", "situation", "task"] as const)(
    "rejects a missing %s",
    (field) => {
      expect(without(field).success).toBe(false);
    },
  );

  it("rejects a non-kebab-case id or experienceId", () => {
    expect(parse({ id: "Not Kebab" }).success).toBe(false);
    expect(parse({ experienceId: "Not Kebab" }).success).toBe(false);
  });

  it("rejects empty narrative strings", () => {
    expect(parse({ title: "" }).success).toBe(false);
    expect(parse({ situation: "" }).success).toBe(false);
    expect(parse({ task: "" }).success).toBe(false);
    expect(parse({ reflection: "" }).success).toBe(false);
  });

  it("rejects empty actions and empty results", () => {
    expect(issuePaths(parse({ actions: [] }))).toContain("actions");
    expect(issuePaths(parse({ results: [] }))).toContain("results");
  });

  it("rejects an empty string inside actions or results", () => {
    expect(parse({ actions: [""] }).success).toBe(false);
    expect(parse({ results: ["Fine.", ""] }).success).toBe(false);
  });
});

describe("careerStorySchema — related experiences", () => {
  it("rejects an empty relatedExperienceIds array — omit it when unused", () => {
    expect(issuePaths(parse({ relatedExperienceIds: [] }))).toContain("relatedExperienceIds");
  });

  it("rejects duplicate related ids", () => {
    const result = parse({
      relatedExperienceIds: ["fixture-role-otherco-2016", "fixture-role-otherco-2016"],
    });
    expect(issuePaths(result)).toContain("relatedExperienceIds");
  });

  it("rejects a related id equal to the primary experienceId", () => {
    const result = parse({ relatedExperienceIds: [validStory.experienceId] });
    expect(issuePaths(result)).toContain("relatedExperienceIds");
  });
});

describe("careerStorySchema — competencies", () => {
  it("rejects a primary competency outside the controlled vocabulary", () => {
    expect(issuePaths(parse({ primaryCompetency: "kubernetes" }))).toContain("primaryCompetency");
    expect(parse({ primaryCompetency: "resilience-and-adaptability" }).success).toBe(false);
  });

  it("rejects a supporting competency outside the controlled vocabulary", () => {
    expect(issuePaths(parse({ supportingCompetencies: ["typescript"] }))).toContain(
      "supportingCompetencies.0",
    );
  });

  it("rejects a missing supportingCompetencies array", () => {
    expect(without("supportingCompetencies").success).toBe(false);
  });

  it("rejects more than five supporting competencies", () => {
    const result = parse({ supportingCompetencies: COMPETENCIES.slice(0, 6) });
    expect(issuePaths(result)).toContain("supportingCompetencies");
  });

  it("rejects duplicate supporting competencies", () => {
    const result = parse({ supportingCompetencies: ["collaboration", "collaboration"] });
    expect(issuePaths(result)).toContain("supportingCompetencies");
  });

  it("rejects the primary competency appearing among the supporting ones", () => {
    const result = parse({ supportingCompetencies: ["leadership"] });
    expect(issuePaths(result)).toContain("supportingCompetencies");
  });
});

describe("careerStorySchema — retrieval tags", () => {
  it("rejects an empty retrievalTags list", () => {
    expect(issuePaths(parse({ retrievalTags: [] }))).toContain("retrievalTags");
  });

  it("rejects duplicate retrieval tags", () => {
    expect(issuePaths(parse({ retrievalTags: ["a-tag", "a-tag"] }))).toContain("retrievalTags");
  });

  it("rejects more than fifteen retrieval tags", () => {
    const tags = Array.from({ length: 16 }, (_, index) => `tag-${index}`);
    expect(issuePaths(parse({ retrievalTags: tags }))).toContain("retrievalTags");
  });

  it("rejects a tag that exactly equals a controlled competency", () => {
    expect(parse({ retrievalTags: ["client-recovery", "leadership"] }).success).toBe(false);
    expect(parse({ retrievalTags: ["ownership"] }).success).toBe(false);
  });

  it("rejects tags that are not lower-kebab-case, without normalizing them", () => {
    for (const tag of ["Client-Recovery", "client recovery", "client_recovery", "-leading", ""]) {
      expect(parse({ retrievalTags: [tag] }).success).toBe(false);
    }
  });
});

describe("careerStorySchema — persisted shape", () => {
  it("rejects a persisted retrievalQuestions key — eval questions live outside the story (#295)", () => {
    const result = parse({ retrievalQuestions: ["Tell me about a time you led a recovery."] });
    expect(result.success).toBe(false);
  });

  it("rejects any other unknown key rather than silently dropping it", () => {
    expect(parse({ highlights: ["Should not be here."] }).success).toBe(false);
  });
});
