import { describe, expect, it } from "vitest";
import { scoreAnswerAssertions } from "./answer-assertions.js";

describe("scoreAnswerAssertions", () => {
  it("scores 1 when every mustMatch pattern is present and no mustNotMatch pattern appears", () => {
    const result = scoreAnswerAssertions(
      "The document-extraction work was a proof of concept; production kept the vendor.",
      { mustMatch: ["proof of concept"], mustNotMatch: ["30%\\s*to\\s*87%"] },
    );
    expect(result.score).toBe(1);
    expect(result.reason).toMatch(/2\/2/);
  });

  it("matches case-insensitively", () => {
    const result = scoreAnswerAssertions("It was a PROOF OF CONCEPT.", {
      mustMatch: ["proof of concept"],
    });
    expect(result.score).toBe(1);
  });

  it("scores the fraction of assertions that passed and names the failures", () => {
    const result = scoreAnswerAssertions(
      "Accuracy went from 30% to 87% and it replaced the vendor at 3% of its cost.",
      {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["30%\\s*to\\s*87%", "3% of (?:its|the vendor's) cost"],
      },
    );
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/missing required pattern/i);
    expect(result.reason).toMatch(/forbidden pattern matched/i);
  });

  it("counts a partially satisfied assertion set proportionally", () => {
    const result = scoreAnswerAssertions("It was a proof of concept that beat the vendor.", {
      mustMatch: ["proof of concept"],
      mustNotMatch: ["beat the vendor"],
    });
    expect(result.score).toBe(0.5);
  });

  /**
   * #294 third independent-review correction (finding 1): `mustCiteEntity` /
   * `mustNotCiteEntity` must check the citation markers actually present in
   * the FINAL ANSWER TEXT (parsed with the shared `parseCitations`, same as
   * the groundedness scorer), not the flattened `toolCitations` array a run
   * returns. A tool merely *returning* a citation in the same run — an
   * alternative story `list-career-stories` surfaced, say — is not the same
   * as the answer actually citing it: the prior `toolCitations`-based check
   * let an answer that cited only `recommendation:some-rec` score 1 for
   * `mustCiteEntity: story:...` whenever a story citation was merely
   * present somewhere in `toolCitations`, and rejected a correct answer for
   * `mustNotCiteEntity` whenever a tool returned an uncited alternative.
   */
  describe("mustCiteEntity / mustNotCiteEntity (#294 third independent-review correction)", () => {
    it("scores 1 when a required citation marker is present in the answer text", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito. [cite:story:xogito-client-account-recovery]",
        { mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }] },
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when the required entity was cited only in prose or as a different marker, never as its own citation marker in the answer text — the exact counterexample the review reproduced (a run's tool citations included it, but the answer text did not cite it)", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust. [cite:recommendation:some-rec]",
        { mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }] },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/missing required citation/i);
    });

    it("scores 0 when the answer carries no citation markers at all, even if it mentions the entity by name", () => {
      const result = scoreAnswerAssertions("He rebuilt client trust at Xogito.", {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      });
      expect(result.score).toBe(0);
    });

    it("scores 0 when a forbidden citation marker IS present in the answer text", () => {
      const result = scoreAnswerAssertions(
        "He showed leadership without formal authority. [cite:story:mutual-informal-leadership]",
        { mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }] },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/forbidden citation present/i);
    });

    it("scores 1 when a forbidden entity is absent from the answer's citation markers, even though it was RETURNED by a tool during the run — a correct answer must not be punished for an uncited alternative", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito. [cite:story:xogito-client-account-recovery]",
        { mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }] },
      );
      expect(result.score).toBe(1);
    });

    it("combines with mustMatch/mustNotMatch proportionally", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito. [cite:story:xogito-client-account-recovery]",
        {
          mustMatch: ["Xogito"],
          mustCiteEntity: [{ entityType: "story", entityId: "some-other-story" }],
        },
      );
      expect(result.score).toBe(0.5);
    });
  });

  /**
   * #295 multiple-valid-answer/cross-cutting citation groups — a case with
   * SEVERAL honest candidate citations, not one fixed required/forbidden
   * pair. `mode: "any"` also enforces the manifest's one-story-answer
   * semantics: exactly one of the group's refs must be cited, not zero and
   * not several blended together.
   */
  describe("citationGroups (#295)", () => {
    const storyA = { entityType: "story" as const, entityId: "xogito-client-account-recovery" };
    const storyB = { entityType: "story" as const, entityId: "mutual-informal-leadership" };
    const storyC = { entityType: "story" as const, entityId: "cross-team-onboarding-framework" };

    it("scores 1 for an 'all' group when every ref is cited", () => {
      const result = scoreAnswerAssertions(
        "[cite:story:xogito-client-account-recovery] [cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "all", refs: [storyA, storyB] }] },
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 for an 'all' group missing one ref", () => {
      const result = scoreAnswerAssertions("[cite:story:xogito-client-account-recovery]", {
        citationGroups: [{ mode: "all", refs: [storyA, storyB] }],
      });
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/citation group|missing/i);
    });

    it("scores 1 for an 'any' group when exactly one ref is cited", () => {
      const result = scoreAnswerAssertions("[cite:story:mutual-informal-leadership]", {
        citationGroups: [{ mode: "any", refs: [storyA, storyB, storyC] }],
      });
      expect(result.score).toBe(1);
    });

    it("scores 0 for an 'any' group when none of the refs are cited", () => {
      const result = scoreAnswerAssertions("[cite:story:some-other-story]", {
        citationGroups: [{ mode: "any", refs: [storyA, storyB] }],
      });
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/did not cite any/i);
    });

    it("scores 0 for an 'any' group when more than one ref is cited (one-story-answer semantics)", () => {
      const result = scoreAnswerAssertions(
        "[cite:story:xogito-client-account-recovery] [cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB] }] },
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/more than one|single/i);
    });

    it("scores 1 when the cited ref matches an 'any' group's preferredRef", () => {
      const result = scoreAnswerAssertions("[cite:story:xogito-client-account-recovery]", {
        citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }],
      });
      expect(result.score).toBe(1);
    });

    /**
     * #295 correction (independent Codex review, agent package `1dd7ac7`,
     * finding 4): #295 says an acceptable alternative fails the preference
     * check ONLY when the preferred source was returned by a tool that
     * turn — a preference cannot be "not honored" when the preferred story
     * was never available to cite. Both branches below prove that: the same
     * answer (citing the honest, non-preferred alternative) fails when the
     * preferred source WAS returned that turn, and passes when it was NOT.
     */
    it("scores 0 when the preferred source was returned by a tool this turn but the answer cites an acceptable alternative instead", () => {
      const result = scoreAnswerAssertions(
        "[cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }] },
        [storyA, storyB],
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/preferred/i);
    });

    it("scores 1 when the preferred source was NOT returned by any tool this turn and the answer cites the honest acceptable alternative it was actually given", () => {
      const result = scoreAnswerAssertions(
        "[cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }] },
        [storyB],
      );
      expect(result.score).toBe(1);
    });

    it("combines multiple groups and other assertion kinds proportionally", () => {
      const result = scoreAnswerAssertions("[cite:story:xogito-client-account-recovery]", {
        mustMatch: ["Xogito"],
        citationGroups: [
          { mode: "any", refs: [storyA, storyB] },
          { mode: "all", refs: [storyA, storyC] },
        ],
      });
      // mustMatch passes, the 'any' group passes (storyA cited), the 'all'
      // group fails (storyC never cited) — 2/3.
      expect(result.score).toBeCloseTo(2 / 3, 4);
    });
  });
});
