import { describe, expect, it } from "vitest";
import { evalCaseSchema, evalDatasetSchema } from "./schema.js";

const validCase = {
  id: "grounded-typescript-house-numbers",
  category: "grounded",
  question: "What has he built with TypeScript at House Numbers?",
  gapHonestyDirection: "claimed",
};

describe("evalCaseSchema", () => {
  it("accepts a well-formed grounded case", () => {
    expect(evalCaseSchema.safeParse(validCase).success).toBe(true);
  });

  it("rejects a case missing a question", () => {
    const { question, ...rest } = validCase;
    expect(evalCaseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, category: "unrelated" });
    expect(result.success).toBe(false);
  });

  it("rejects an id that isn't kebab-case", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, id: "Not Kebab Case" });
    expect(result.success).toBe(false);
  });

  it("rejects a grounded case whose direction is 'gap' (category/direction must agree)", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, gapHonestyDirection: "gap" });
    expect(result.success).toBe(false);
  });

  it("rejects a gap case whose direction is 'claimed'", () => {
    const result = evalCaseSchema.safeParse({
      ...validCase,
      category: "gap",
      gapHonestyDirection: "claimed",
    });
    expect(result.success).toBe(false);
  });

  describe("answerAssertions (#300 / #295 factual boundaries)", () => {
    it("accepts mustMatch and mustNotMatch regex-source lists", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          mustMatch: ["proof.of.concept|PoC"],
          mustNotMatch: ["30%\\s*(?:→|->|to)\\s*87%"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a one-sided assertion (only mustNotMatch)", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: { mustNotMatch: ["3% of (?:its|the vendor's) cost"] },
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty answerAssertions object (an assertion block must assert something)", () => {
      expect(evalCaseSchema.safeParse({ ...validCase, answerAssertions: {} }).success).toBe(false);
    });

    it("rejects a pattern that is not a valid regular expression", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: { mustMatch: ["(unclosed"] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown keys inside answerAssertions", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: { mustMatch: ["x"], contains: ["y"] },
      });
      expect(result.success).toBe(false);
    });

    /**
     * #294 independent-review correction (finding 3/4b): a `mustMatch` text
     * pattern only checks the answer's WORDING — it cannot tell whether the
     * cited entity actually backing the answer is the required story versus
     * some other returned citation (recommendation, experience, or the
     * wrong story) that happens to share vocabulary. `mustCiteEntity` /
     * `mustNotCiteEntity` assert directly against the run's actual returned
     * citations (`EvalTranscript.toolCitations`), the same ground truth the
     * groundedness scorer's citation-validity check already uses.
     */
    describe("mustCiteEntity / mustNotCiteEntity (#294 independent-review correction)", () => {
      it("accepts a mustCiteEntity / mustNotCiteEntity ref list", () => {
        const result = evalCaseSchema.safeParse({
          ...validCase,
          answerAssertions: {
            mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
            mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }],
          },
        });
        expect(result.success).toBe(true);
      });

      it("rejects a citation ref with an unknown entityType", () => {
        const result = evalCaseSchema.safeParse({
          ...validCase,
          answerAssertions: {
            mustCiteEntity: [{ entityType: "not-a-real-type", entityId: "x" }],
          },
        });
        expect(result.success).toBe(false);
      });

      it("rejects a citation ref missing entityId", () => {
        const result = evalCaseSchema.safeParse({
          ...validCase,
          answerAssertions: { mustCiteEntity: [{ entityType: "story" }] },
        });
        expect(result.success).toBe(false);
      });

      it("counts mustCiteEntity toward the 'must assert something' minimum, alone", () => {
        const result = evalCaseSchema.safeParse({
          ...validCase,
          answerAssertions: {
            mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
          },
        });
        expect(result.success).toBe(true);
      });
    });
  });

  /**
   * #295 third-independent-review correction, finding 1: a `mustMatch`
   * requirement scoped to "only when the answer actually cites this
   * entity" — story 004's mandatory positive caveat (spam/unsupported/
   * observability-gap) must not be forced on an `any` case that truthfully
   * answers with a different acceptable story (e.g. 015).
   */
  describe("conditionalMustMatch (#295 third-independent-review correction, finding 1)", () => {
    it("accepts a conditionalMustMatch entry", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          conditionalMustMatch: [
            {
              ifCitedRef: {
                entityType: "story",
                entityId: "house-numbers-communication-service-ownership",
              },
              pattern: "spam",
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects a conditionalMustMatch entry with an invalid pattern", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          conditionalMustMatch: [
            {
              ifCitedRef: { entityType: "story", entityId: "x" },
              pattern: "(unclosed",
            },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects a conditionalMustMatch entry with an unknown entityType in ifCitedRef", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          conditionalMustMatch: [
            { ifCitedRef: { entityType: "not-a-real-type", entityId: "x" }, pattern: "spam" },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it("counts a conditionalMustMatch entry toward the 'must assert something' minimum, alone", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          conditionalMustMatch: [
            { ifCitedRef: { entityType: "story", entityId: "x" }, pattern: "spam" },
          ],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("citationGroups (#295 any/all/preferredSource semantics)", () => {
    it("accepts an 'all' group (cross-cutting: every ref required)", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "all",
              refs: [
                { entityType: "story", entityId: "fullstack-labs-sap-migration" },
                { entityType: "story", entityId: "house-numbers-secure-public-document-upload" },
              ],
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an 'any' group with a preferredRef that is one of refs", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "any",
              refs: [
                { entityType: "story", entityId: "xogito-client-account-recovery" },
                { entityType: "story", entityId: "mutual-informal-leadership" },
              ],
              preferredRef: { entityType: "story", entityId: "xogito-client-account-recovery" },
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an 'any' group with no preferredRef", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "any",
              refs: [
                { entityType: "story", entityId: "cross-team-onboarding-framework" },
                { entityType: "story", entityId: "rokk3r-sustainable-performance-feedback" },
              ],
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects a preferredRef that is not one of refs", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "any",
              refs: [
                { entityType: "story", entityId: "xogito-client-account-recovery" },
                { entityType: "story", entityId: "mutual-informal-leadership" },
              ],
              preferredRef: { entityType: "story", entityId: "cross-team-onboarding-framework" },
            },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects a group with fewer than two refs (a single-ref requirement belongs in mustCiteEntity)", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "any",
              refs: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
            },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown mode", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "either",
              refs: [
                { entityType: "story", entityId: "xogito-client-account-recovery" },
                { entityType: "story", entityId: "mutual-informal-leadership" },
              ],
            },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it("counts a citationGroups entry toward the 'must assert something' minimum, alone", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        answerAssertions: {
          citationGroups: [
            {
              mode: "any",
              refs: [
                { entityType: "story", entityId: "xogito-client-account-recovery" },
                { entityType: "story", entityId: "mutual-informal-leadership" },
              ],
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("expectedCompetencies (#294 independent-review correction)", () => {
    it("accepts a case with expectedToolCall 'list-career-stories' and expectedCompetencies", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        expectedToolCall: "list-career-stories",
        expectedCompetencies: ["leadership"],
      });
      expect(result.success).toBe(true);
    });

    it("omits expectedCompetencies by default", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        expectedToolCall: "list-career-stories",
      });
      expect(result.success && result.data.expectedCompetencies).toBeUndefined();
    });

    it("rejects an empty expectedCompetencies array", () => {
      const result = evalCaseSchema.safeParse({
        ...validCase,
        expectedToolCall: "list-career-stories",
        expectedCompetencies: [],
      });
      expect(result.success).toBe(false);
    });
  });

  it("accepts a case with an expectedToolCall of 'search-career' (#75 RAG-grounded case)", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, expectedToolCall: "search-career" });
    expect(result.success).toBe(true);
  });

  it("accepts a case with an expectedToolCall of 'deterministic-only' (#75 exact-fact case)", () => {
    const result = evalCaseSchema.safeParse({
      ...validCase,
      expectedToolCall: "deterministic-only",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a case with an expectedToolCall of 'list-career-stories' (#294 behavioral-question case)", () => {
    const result = evalCaseSchema.safeParse({
      ...validCase,
      expectedToolCall: "list-career-stories",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a case with an expectedToolCall of 'search-career-story-scoped' (#294 independent-review correction: fuzzy behavioral routing must assert sourceTypes, not just tool presence)", () => {
    const result = evalCaseSchema.safeParse({
      ...validCase,
      expectedToolCall: "search-career-story-scoped",
    });
    expect(result.success).toBe(true);
  });

  it("omits expectedToolCall by default — not every case asserts tool-call routing", () => {
    const result = evalCaseSchema.safeParse(validCase);
    expect(result.success).toBe(true);
    expect(result.success && result.data.expectedToolCall).toBeUndefined();
  });

  it("rejects an unknown expectedToolCall value", () => {
    const result = evalCaseSchema.safeParse({ ...validCase, expectedToolCall: "some-other-tool" });
    expect(result.success).toBe(false);
  });

  it("accepts an off-topic case with direction 'n/a'", () => {
    const result = evalCaseSchema.safeParse({
      id: "off-topic-pizza",
      category: "off-topic",
      question: "What's your favorite pizza topping?",
      gapHonestyDirection: "n/a",
    });
    expect(result.success).toBe(true);
  });
});

describe("evalDatasetSchema", () => {
  it("accepts an array of valid, uniquely-id'd cases", () => {
    const other = { ...validCase, id: "grounded-aws-house-numbers" };
    expect(evalDatasetSchema.safeParse([validCase, other]).success).toBe(true);
  });

  it("rejects a dataset with duplicate ids", () => {
    const result = evalDatasetSchema.safeParse([validCase, validCase]);
    expect(result.success).toBe(false);
  });

  it("rejects a dataset containing one malformed case", () => {
    const malformed = { id: "broken", category: "grounded" };
    const result = evalDatasetSchema.safeParse([validCase, malformed]);
    expect(result.success).toBe(false);
  });
});
