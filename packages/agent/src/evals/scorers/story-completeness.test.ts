import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scoreStoryCompleteness } from "./story-completeness.js";

const MODULE_SOURCE = readFileSync(
  fileURLToPath(new URL("./story-completeness.ts", import.meta.url)),
  "utf8",
);

/**
 * #295 correction (independent Codex review, agent package `1dd7ac7`,
 * finding 2): #295 requires "an agent assertion that answers include
 * grounded situation, actions, and results rather than only adjectives or
 * testimonials" and "a story-completeness scorer... resilient to prose
 * formatting: it should score factual coverage of the returned
 * situation/actions/results, not require literal STAR headings." These
 * tests prove both halves: a fluid-prose complete answer scores fully with
 * no headings, and an adjective/testimonial-only answer — the exact
 * regression #295 flags — scores low.
 */
describe("scoreStoryCompleteness", () => {
  it("scores 1 for a complete situation/action/result answer written as fluid prose, with no STAR headings", () => {
    const result = scoreStoryCompleteness({
      answer:
        "When the client relationship soured after a missed deadline, Marcos rebuilt trust by " +
        "personally taking over delivery and renegotiating priorities with the client. As a " +
        "result, the account was retained and the client later commissioned further work.",
    });
    expect(result.score).toBe(1);
  });

  it("scores low for an adjective/testimonial-only answer with no concrete situation, action, or result — the exact regression #295 flags", () => {
    const result = scoreStoryCompleteness({
      answer:
        "Marcos is an incredibly dedicated, thoughtful, and skilled engineer who everyone " +
        "genuinely loves working with and deeply respects.",
    });
    expect(result.score).toBeLessThanOrEqual(1 / 3);
    expect(result.reason).toMatch(/situation|action|result/i);
  });

  it("scores 2/3 when the answer names an action and a result but never sets up the situation/context", () => {
    const result = scoreStoryCompleteness({
      answer: "He rebuilt the client relationship, which restored the account.",
    });
    expect(result.score).toBeCloseTo(2 / 3, 4);
  });

  it("scores 1/3 when the answer only sets up the situation with no described action or stated result", () => {
    const result = scoreStoryCompleteness({
      answer: "When the client relationship soured after a missed deadline, it was a hard time.",
    });
    expect(result.score).toBeCloseTo(1 / 3, 4);
  });

  /**
   * #295 second independent-review correction (finding 2): "Story
   * completeness measures generic linguistic cues, not factual
   * situation/action/result coverage. The scorer returns 1.0 for: 'When a
   * difficult situation appeared, Marcos built a solution. As a result, it
   * enabled success.' That contains no facts from the returned story."
   * When `storyIds` names a known story, completeness must be scored
   * against THAT story's real, concrete facts — not generic STAR-shaped
   * connective language a model can produce with zero grounding.
   */
  describe("grounded mode (#295 second independent-review correction, finding 2)", () => {
    it("scores near-zero for the exact generic-cue boilerplate the review reproduced, once a known story id is supplied", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "When a difficult situation appeared, Marcos built a solution. As a result, it enabled success.",
        },
        ["xogito-client-account-recovery"],
      );
      expect(result.score).toBe(0);
    });

    it("scores 1 for a genuinely grounded answer naming real situation/action/result facts from the cited story", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "After the project manager resigned, the client was deeply frustrated with progress. " +
            "Marcos increased the meeting cadence and delivered quick wins alongside the core repairs. " +
            "As a result, trust returned and the client later commissioned additional projects. " +
            "[cite:story:xogito-client-account-recovery]",
        },
        ["xogito-client-account-recovery"],
      );
      expect(result.score).toBe(1);
    });

    it("falls back to the generic signal heuristic when no supplied story id is a known one", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "When the client relationship soured after a missed deadline, Marcos rebuilt trust by " +
            "personally taking over delivery. As a result, the account was retained.",
        },
        ["some-unknown-story-id"],
      );
      expect(result.score).toBe(1);
    });

    it("scores against the actually-cited story among several acceptable candidates, not an uncited one", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "At Kubesoft, a hackathon-winning product stalled over a prize dispute. Marcos renounced " +
            "his own share and began building the backend. As a result, the product launched and was " +
            "handed over to the government. [cite:story:mutual-informal-leadership]",
        },
        ["xogito-client-account-recovery", "mutual-informal-leadership"],
      );
      expect(result.score).toBe(1);
    });

    /**
     * #295 third-independent-review correction, finding 2: "The scorer
     * receives every acceptable story id and takes the best factual match.
     * An answer containing a complete Mutual narrative while citing only
     * Xogito scores storyCompleteness: 1.0 because the Mutual anchors
     * match." Completeness must be scored against the story the answer
     * ACTUALLY CITES, intersected with the case's acceptable candidates —
     * never an uncited alternative, no matter how complete its facts are.
     */
    it("scores low when the answer's complete facts belong to an uncited acceptable story, and it only cites a different (factually unsupported) one — the reproduced fact/citation mismatch", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "At Kubesoft, a hackathon-winning product stalled over a prize dispute. Marcos renounced " +
            "his own share and began building the backend. As a result, the product launched and was " +
            "handed over to the government. [cite:story:xogito-client-account-recovery]",
        },
        ["xogito-client-account-recovery", "mutual-informal-leadership"],
      );
      expect(result.score).toBe(0);
    });

    /**
     * #295 third-independent-review correction, finding 3: "Cross-cutting
     * `all` cases require citations but not complete factual coverage for
     * every required story... require situation/action/result coverage for
     * each required cited story; best-of-one semantics are valid only for a
     * single-source or `any` case." Passing `mode: "all"` must score the
     * WORST of the required stories, not the best.
     */
    describe("mode: 'all' — cross-cutting full coverage (#295 third-independent-review correction, finding 3)", () => {
      const sapComplete =
        "The legacy SAP financial calculations needed migrating. Marcos wrote ETL scripts to " +
        "handle rounding differences. The migration completed without data loss, drawing on legacy-" +
        "system experts. [cite:story:fullstack-labs-sap-migration]";
      const publicUploadComplete =
        "The WordPress upload flow had roughly two out of every three submissions fail silently. " +
        "Marcos added CAPTCHA, rate limiting, and hybrid routing. Complaints stopped and an audit " +
        "history was preserved. [cite:story:house-numbers-secure-public-document-upload]";
      const pipelineComplete =
        "The loan analysis pipeline was one large monolith orchestration. Marcos split it into " +
        "three independently testable units connected by a message bus. It reached production and " +
        "made failures easier to locate. [cite:story:house-numbers-loan-analysis-pipeline-decomposition]";
      const requiredIds = [
        "fullstack-labs-sap-migration",
        "house-numbers-secure-public-document-upload",
        "house-numbers-loan-analysis-pipeline-decomposition",
      ];

      it("scores low (the review's C01 counterexample) when the answer narrates only one required story fully and bare-cites the others with no facts", () => {
        const result = scoreStoryCompleteness(
          {
            answer:
              `${sapComplete} [cite:story:house-numbers-secure-public-document-upload] ` +
              "[cite:story:house-numbers-loan-analysis-pipeline-decomposition]",
          },
          requiredIds,
          "all",
        );
        expect(result.score).toBeLessThanOrEqual(1 / 3);
      });

      it("scores 1 when the answer narrates complete situation/action/result facts for every required story", () => {
        const result = scoreStoryCompleteness(
          { answer: `${sapComplete} ${publicUploadComplete} ${pipelineComplete}` },
          requiredIds,
          "all",
        );
        expect(result.score).toBe(1);
      });
    });
  });
  /**
   * #307 confirmed defect: `STORY_FACT_ANCHORS` pinned one exact inflection
   * of each real fact (e.g. `contain(?:ed)? the cascade`, `communicating
   * capacity`, `do not consider`), so an honest answer using a different,
   * equally-grounded inflection of the SAME fact (`containing the
   * cascading`, `communicate capacity`, `does not consider`) scored a
   * missing signal even though it states the real fact. Each case below is
   * one of the near-misses the 66-case run actually produced.
   */
  describe("inflection-tolerant fact anchors (#307)", () => {
    it("house-numbers-zod-production-incident: 'containing the cascading' (no 'regression tests') and 're-processing' still match the action/result anchors", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "A Zod upgrade triggered 96 restarts in a crash loop. Marcos worked on containing the " +
            "cascading failures. The documents ended up re-processing with no permanent data loss. " +
            "[cite:story:house-numbers-zod-production-incident]",
        },
        ["house-numbers-zod-production-incident"],
      );
      expect(result.score).toBe(1);
    });

    it("house-numbers-zod-production-incident: 'without permanent data loss' still matches the result anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "A Zod upgrade caused a crash loop with 96 restarts. Marcos contained the cascade with " +
            "regression tests, and the documents were reprocessed without permanent data loss. " +
            "[cite:story:house-numbers-zod-production-incident]",
        },
        ["house-numbers-zod-production-incident"],
      );
      expect(result.score).toBe(1);
    });

    it("mutual-sustainable-ownership-failure: 'does not consider the broader project a success' still matches the result anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "At a hackathon a stalled product needed a decision. Marcos renounced his own share to " +
            "keep it moving. He does not consider the broader project a success, since shared " +
            "ownership never recovered. [cite:story:mutual-sustainable-ownership-failure]",
        },
        ["mutual-sustainable-ownership-failure"],
      );
      expect(result.score).toBe(1);
    });

    it("belatrix-destructive-deployment-accountability: 'reported the incident' and 'restrict the script' still match the action anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "A destructive script ran against shared DynamoDB in a shared development environment. " +
            "Marcos reported the incident immediately and moved to restrict the script from running " +
            "again. Trust was rebuilt and access was restored. " +
            "[cite:story:belatrix-destructive-deployment-accountability]",
        },
        ["belatrix-destructive-deployment-accountability"],
      );
      expect(result.score).toBe(1);
    });

    it("rokk3r-sustainable-performance-feedback: 'communicate capacity' still matches the action anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "Marcos was seen as a rockstar developer working late into the night. Feedback helped " +
            "him learn to communicate capacity honestly. Quality and working rhythm restored, and " +
            "the MVP shipped successfully. [cite:story:rokk3r-sustainable-performance-feedback]",
        },
        ["rokk3r-sustainable-performance-feedback"],
      );
      expect(result.score).toBe(1);
    });

    it("rokk3r-sustainable-performance-feedback: 'working rhythm restored' without the 'quality and' prefix still matches the result anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "Marcos was seen as a rockstar developer working late into the night. He took a week " +
            "away to reset. Working rhythm restored soon after. " +
            "[cite:story:rokk3r-sustainable-performance-feedback]",
        },
        ["rokk3r-sustainable-performance-feedback"],
      );
      expect(result.score).toBe(1);
    });

    it("mutual-informal-leadership: 'launch' (not 'launched', and no 'handed ... government' phrasing) still matches the result anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "At a hackathon, a promising product stalled over a prize dispute. Marcos renounced his " +
            "own share and kept building. It went on to launch successfully in production. " +
            "[cite:story:mutual-informal-leadership]",
        },
        ["mutual-informal-leadership"],
      );
      expect(result.score).toBe(1);
    });

    it("cross-team-onboarding-framework: 'minimal onboarding guidance' still matches the situation anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "New teammates had only minimal onboarding guidance. Marcos introduced a first-contact " +
            "checklist and onboarding buddies. 15 people went through it and other teams adopted the " +
            "framework. [cite:story:cross-team-onboarding-framework]",
        },
        ["cross-team-onboarding-framework"],
      );
      expect(result.score).toBe(1);
    });

    it("cross-team-onboarding-framework: 'absence of onboarding support' still matches the situation anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "New teammates faced an absence of onboarding support. Marcos introduced a first-contact " +
            "checklist and onboarding buddies. 15 people were onboarded and it was adopted elsewhere. " +
            "[cite:story:cross-team-onboarding-framework]",
        },
        ["cross-team-onboarding-framework"],
      );
      expect(result.score).toBe(1);
    });

    it("house-numbers-secure-public-document-upload: 'audit trail' (no 'complaints stopped' phrasing) still matches the result anchor", () => {
      const result = scoreStoryCompleteness(
        {
          answer:
            "The WordPress upload flow had roughly two out of every three submissions fail " +
            "silently. Marcos added CAPTCHA, rate limiting, and hybrid routing. The workflow now " +
            "preserves an audit trail of every submission. " +
            "[cite:story:house-numbers-secure-public-document-upload]",
        },
        ["house-numbers-secure-public-document-upload"],
      );
      expect(result.score).toBe(1);
    });
  });

  /**
   * #295 fourth independent-review correction, finding 3: the module doc
   * comment above `scoreStoryCompleteness` must describe the CURRENT
   * cited-story-intersection and any/all semantics, not the removed
   * `runner.ts` helper name or the pre-third-review "best match across
   * supplied ids, ground exactly one story" behavior. A stale doc comment
   * is undetectable by any behavioral test, so this one instead reads the
   * module's own source text and pins that the corrected prose is present
   * and the retired references are gone.
   */
  describe("module doc comment stays in sync with the actual contract (#295 fourth independent-review correction, finding 3)", () => {
    it("no longer references the removed runner.ts helper storyIdsOf", () => {
      expect(MODULE_SOURCE).not.toMatch(/storyIdsOf/);
    });

    it("no longer claims completeness takes the best match across every supplied id regardless of citation", () => {
      expect(MODULE_SOURCE).not.toMatch(/BEST match across the supplied ids/);
    });

    it("describes scoring against the intersection of supplied ids and the answer's actual citations", () => {
      expect(MODULE_SOURCE).toMatch(/intersection/i);
    });
  });
});
