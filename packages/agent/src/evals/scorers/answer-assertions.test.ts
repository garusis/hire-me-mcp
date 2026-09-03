import { describe, expect, it } from "vitest";
import {
  scoreAnswerAssertions,
  scoreFactualBoundaryCompliance,
  scorePreferredSourceCompliance,
} from "./answer-assertions.js";

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
  /**
   * #295 third-independent-review correction, finding 1: a positive caveat
   * tied to ONE specific cited story must be enforced only when that story
   * is actually cited — not unconditionally (which would wrongly demand it
   * from an `any` case that truthfully answers with a different acceptable
   * story), and not silently skipped either.
   */
  describe("conditionalMustMatch (#295 third-independent-review correction, finding 1)", () => {
    const story004 = {
      entityType: "story" as const,
      entityId: "house-numbers-communication-service-ownership",
    };

    it("fails when the referenced story is cited but the required caveat text is absent", () => {
      const result = scoreAnswerAssertions(
        "The communications workflow reached approximately 70% effective triage. " +
          "[cite:story:house-numbers-communication-service-ownership]",
        { conditionalMustMatch: [{ ifCitedRef: story004, pattern: "spam" }] },
      );
      expect(result.score).toBeLessThan(1);
      expect(result.reason).toMatch(/caveat/i);
    });

    it("passes when the referenced story is cited and the required caveat text is present", () => {
      const result = scoreAnswerAssertions(
        "The communications workflow reached approximately 70% effective triage, though the " +
          "remaining bucket includes spam, unsupported cases, and an observability gap. " +
          "[cite:story:house-numbers-communication-service-ownership]",
        { conditionalMustMatch: [{ ifCitedRef: story004, pattern: "spam" }] },
      );
      expect(result.score).toBe(1);
    });

    it("does not apply the caveat at all when the referenced story is not cited (an `any` case truthfully answering with a different story)", () => {
      const result = scoreAnswerAssertions(
        "Engineers improved a versioned debugging skill from incident lessons. " +
          "[cite:story:house-numbers-cross-service-debugging-skill]",
        { conditionalMustMatch: [{ ifCitedRef: story004, pattern: "spam" }] },
      );
      expect(result.score).toBe(1);
      expect(result.reason).toMatch(/^0\/0/);
    });
  });

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

  /**
   * #295 second independent-review correction (finding 4): "For X01, citing
   * story 002 while tools returned 001 and 002 scores `answerAssertions:
   * 0.8`; the committed threshold is also 0.8, so the overall verdict
   * passes... Report preferred-source compliance independently and make any
   * available-but-skipped preferred source fail the eval." A single blended
   * `answerAssertions` fraction can never guarantee this — it can always be
   * diluted by unrelated passing assertions in the SAME case, or averaged
   * away across many OTHER passing cases in the aggregate. `../report.ts`
   * wires this into its own `preferredSourceCompliance` aggregate, gated by
   * a blocking (1.0) threshold in `../thresholds.ts`, mirroring the
   * retrieval package's own independent `preferredSourceCompliance` fix.
   */
  describe("scorePreferredSourceCompliance (#295 second independent-review correction)", () => {
    const storyA = { entityType: "story" as const, entityId: "xogito-client-account-recovery" };
    const storyB = { entityType: "story" as const, entityId: "mutual-informal-leadership" };

    it("returns null when no citationGroups entry declares a preferredRef", () => {
      const result = scorePreferredSourceCompliance(
        "[cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB] }] },
        [storyA, storyB],
      );
      expect(result).toBeNull();
    });

    it("returns null when the case declares no answerAssertions at all", () => {
      expect(scorePreferredSourceCompliance("anything", undefined, [])).toBeNull();
    });

    it("scores 0 (fails) when the preferred source was returned by a tool this turn but the answer cites an acceptable alternative instead — the exact X01 counterexample", () => {
      const result = scorePreferredSourceCompliance(
        "[cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }] },
        [storyA, storyB],
      );
      expect(result?.score).toBe(0);
      expect(result?.reason).toMatch(/preferred/i);
    });

    it("scores 1 (passes) when the preferred source was returned this turn and the answer cites it", () => {
      const result = scorePreferredSourceCompliance(
        "[cite:story:xogito-client-account-recovery]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }] },
        [storyA, storyB],
      );
      expect(result?.score).toBe(1);
    });

    it("scores 1 (passes, preserved branch) when the preferred source was NOT returned by any tool this turn, even though the answer cites the other acceptable alternative", () => {
      const result = scorePreferredSourceCompliance(
        "[cite:story:mutual-informal-leadership]",
        { citationGroups: [{ mode: "any", refs: [storyA, storyB], preferredRef: storyA }] },
        [storyB],
      );
      expect(result?.score).toBe(1);
    });

    it("averages compliance across multiple preference-declaring groups in the same case", () => {
      const storyC = {
        entityType: "story" as const,
        entityId: "cross-team-onboarding-framework",
      };
      const result = scorePreferredSourceCompliance(
        "[cite:story:mutual-informal-leadership] [cite:story:cross-team-onboarding-framework]",
        {
          citationGroups: [
            { mode: "any", refs: [storyA, storyB], preferredRef: storyA },
            { mode: "any", refs: [storyC], preferredRef: storyC },
          ],
        },
        [storyA, storyB, storyC],
      );
      // First group fails (storyA returned, storyB cited instead); second
      // group passes (storyC returned and cited) -> 0.5.
      expect(result?.score).toBe(0.5);
    });
  });
});

/**
 * #295 third-independent-review correction, finding 1: "Factual-boundary
 * violations are detected but still do not fail the eval... a run
 * containing one such case therefore still passes." A blended
 * `scoreAnswerAssertions` fraction can always be diluted by other passing
 * assertions in the same case (or averaged away across other passing cases
 * in the report aggregate). `scoreFactualBoundaryCompliance` reports the
 * SAME mustMatch/mustNotMatch/conditionalMustMatch checks as an independent,
 * binary pass/fail per case — any single violation fails the case outright,
 * mirroring `scorePreferredSourceCompliance`'s blocking treatment.
 */
describe("scoreFactualBoundaryCompliance (#295 third-independent-review correction, finding 1)", () => {
  it("returns null when the case declares no answerAssertions at all", () => {
    expect(scoreFactualBoundaryCompliance("anything", undefined)).toBeNull();
  });

  it("returns null when the case declares only citation-based assertions (no text/caveat boundary to check)", () => {
    const result = scoreFactualBoundaryCompliance("[cite:story:x]", {
      mustCiteEntity: [{ entityType: "story", entityId: "x" }],
    });
    expect(result).toBeNull();
  });

  it("scores 0 (fails outright) on a single mustNotMatch violation, even though it is the only assertion the case declares", () => {
    const result = scoreFactualBoundaryCompliance(
      "The team achieved LLM accuracy of 95% on this workflow.",
      { mustNotMatch: ["LLM accuracy"] },
    );
    expect(result?.score).toBe(0);
  });

  it("scores 0 (fails outright, not diluted) when only one of several mustMatch/mustNotMatch checks fails — the exact review counterexample where a diluted 0.8 would pass an 0.8 threshold", () => {
    const result = scoreFactualBoundaryCompliance("proof of concept work continued.", {
      mustMatch: ["proof of concept", "unrelated-pattern-that-is-absent"],
    });
    expect(result?.score).toBe(0);
  });

  it("scores 1 when every declared text/caveat assertion holds", () => {
    const result = scoreFactualBoundaryCompliance("This was a proof of concept, never shipped.", {
      mustMatch: ["proof of concept"],
      mustNotMatch: ["shipped to production"],
    });
    expect(result?.score).toBe(1);
  });

  it("enforces story 004's mandatory caveat as blocking: the exact review counterexample scores 0, not a diluted 0.8+", () => {
    const story004 = {
      entityType: "story" as const,
      entityId: "house-numbers-communication-service-ownership",
    };
    const result = scoreFactualBoundaryCompliance(
      "The communications workflow reached approximately 70% effective triage. " +
        "[cite:story:house-numbers-communication-service-ownership]",
      { conditionalMustMatch: [{ ifCitedRef: story004, pattern: "spam" }] },
    );
    expect(result?.score).toBe(0);
  });
});
