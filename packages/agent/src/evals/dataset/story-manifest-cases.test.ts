import { COMPETENCIES, type Competency } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { selectCasesForBudget } from "../runner.js";
import { scoreAnswerAssertions } from "../scorers/answer-assertions.js";
import { EVAL_CASES } from "./cases.js";
import { evalDatasetSchema } from "./schema.js";
import { COMPETENCY_COVERAGE, STORY_MANIFEST_CASES } from "./story-manifest-cases.js";

/** Find a locked manifest case by id, or fail loudly — every id below must exist. */
function requireCase(id: string): (typeof STORY_MANIFEST_CASES)[number] {
  const found = STORY_MANIFEST_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`expected STORY_MANIFEST_CASES to contain "${id}"`);
  return found;
}

/** Assert `violatingAnswer` (which otherwise satisfies `caseId`'s citation requirement) fails that case's answerAssertions specifically on a forbidden-pattern boundary. */
function expectBoundaryViolationCaught(caseId: string, violatingAnswer: string): void {
  const evalCase = requireCase(caseId);
  const assertions = evalCase.answerAssertions;
  if (!assertions) throw new Error(`case "${caseId}" declares no answerAssertions`);
  const allRefs = [
    ...(assertions.mustCiteEntity ?? []),
    ...(assertions.citationGroups ?? []).flatMap((g) => g.refs),
  ];
  const result = scoreAnswerAssertions(violatingAnswer, assertions, allRefs);
  expect(result.score).toBeLessThan(1);
  expect(result.reason).toMatch(/forbidden pattern matched/i);
}

/** Every story ref (mustCiteEntity + citationGroups.refs) a case's answerAssertions names. */
function referencedStoryIds(evalCase: (typeof STORY_MANIFEST_CASES)[number]): string[] {
  const assertions = evalCase.answerAssertions;
  if (!assertions) return [];
  const direct = (assertions.mustCiteEntity ?? []).map((ref) => ref.entityId);
  const grouped = (assertions.citationGroups ?? []).flatMap((group) =>
    group.refs.map((ref) => ref.entityId),
  );
  return [...direct, ...grouped];
}

describe("STORY_MANIFEST_CASES (#295 locked behavioral manifest)", () => {
  it("validates against the dataset schema", () => {
    const result = evalDatasetSchema.safeParse(STORY_MANIFEST_CASES);
    expect(result.success).toBe(true);
  });

  it("has exactly the locked 38 cases", () => {
    expect(STORY_MANIFEST_CASES.length).toBe(38);
  });

  it("has unique ids distinct from the rest of the dataset (story-manifest- prefixed)", () => {
    const ids = STORY_MANIFEST_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^story-manifest-/);
    }
  });

  it("references every one of the 16 locked story stable ids at least once", () => {
    const STORY_IDS = [
      "xogito-client-account-recovery",
      "mutual-informal-leadership",
      "cross-team-onboarding-framework",
      "house-numbers-communication-service-ownership",
      "house-numbers-deterministic-document-checks",
      "fullstack-labs-sap-migration",
      "house-numbers-prompt-platform-migration",
      "house-numbers-secure-public-document-upload",
      "house-numbers-zod-production-incident",
      "house-numbers-vendor-extraction-contract",
      "house-numbers-loan-analysis-pipeline-decomposition",
      "mutual-sustainable-ownership-failure",
      "rokk3r-sustainable-performance-feedback",
      "belatrix-destructive-deployment-accountability",
      "house-numbers-cross-service-debugging-skill",
      "house-numbers-ai-pivot-after-paternity-leave",
    ];
    const referenced = new Set(STORY_MANIFEST_CASES.flatMap((c) => referencedStoryIds(c)));
    for (const storyId of STORY_IDS) {
      expect(referenced.has(storyId)).toBe(true);
    }
  });

  it("names every controlled behavioral competency in at least one case's notes", () => {
    const allNotes = STORY_MANIFEST_CASES.map((c) => c.notes ?? "").join("\n");
    for (const competency of COMPETENCIES) {
      const wordBoundary = new RegExp(`\\b${competency}\\b`);
      expect(allNotes).toMatch(wordBoundary);
    }
  });

  it("routes the locked list count (9), with every remaining case (story-search + absence, 29) on the story-scoped search route", () => {
    const byRoute = new Map<string, number>();
    for (const evalCase of STORY_MANIFEST_CASES) {
      const key = evalCase.expectedToolCall ?? "(none)";
      byRoute.set(key, (byRoute.get(key) ?? 0) + 1);
    }
    expect(byRoute.get("list-career-stories")).toBe(9);
    // story-search (X08, F01-F16, A01-A08, C01-C02 = 27) + absence (N01-N02,
    // reusing the same scorer per its honest-fallback contract — see module
    // docs) = 29.
    expect(byRoute.get("search-career-story-scoped")).toBe(29);
  });

  it("declares expectedCompetencies only for list-career-stories cases", () => {
    for (const evalCase of STORY_MANIFEST_CASES) {
      if (evalCase.expectedToolCall === "list-career-stories") {
        expect(evalCase.expectedCompetencies?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(evalCase.expectedCompetencies).toBeUndefined();
      }
    }
  });

  it("uses citationGroups mode 'all' for the two cross-cutting cases", () => {
    const crossCutting = STORY_MANIFEST_CASES.filter((c) => c.id.startsWith("story-manifest-c0"));
    expect(crossCutting.length).toBe(2);
    for (const evalCase of crossCutting) {
      expect(evalCase.answerAssertions?.citationGroups?.every((g) => g.mode === "all")).toBe(true);
    }
  });

  it("locks the preferred-source cases to their manifest-declared preference", () => {
    const expectedPreferred: Record<string, string> = {
      "story-manifest-x01": "xogito-client-account-recovery",
      "story-manifest-x02": "mutual-informal-leadership",
      "story-manifest-f02": "mutual-informal-leadership",
      "story-manifest-a01": "house-numbers-deterministic-document-checks",
      "story-manifest-a02": "house-numbers-zod-production-incident",
      "story-manifest-a04": "house-numbers-cross-service-debugging-skill",
    };
    for (const [id, preferredId] of Object.entries(expectedPreferred)) {
      const evalCase = STORY_MANIFEST_CASES.find((c) => c.id === id);
      const groups = evalCase?.answerAssertions?.citationGroups ?? [];
      const preferredGroup = groups.find((g) => g.preferredRef !== undefined);
      expect(preferredGroup?.preferredRef?.entityId).toBe(preferredId);
    }
  });

  it("marks both absent-topic cases as honest gaps expecting no story citation", () => {
    const absentCases = STORY_MANIFEST_CASES.filter((c) => c.id.startsWith("story-manifest-n0"));
    expect(absentCases.length).toBe(2);
    for (const evalCase of absentCases) {
      expect(evalCase.category).toBe("gap");
      expect(evalCase.gapHonestyDirection).toBe("gap");
      expect(referencedStoryIds(evalCase).length).toBe(0);
    }
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 5): the prior "every enum string appears somewhere in free-form
   * notes" check can pass with zero real case-to-competency association —
   * the word just has to appear anywhere in the concatenated notes blob.
   * `COMPETENCY_COVERAGE` is a typed table naming the SPECIFIC case ids per
   * competency (the issue's own locked "Controlled competency coverage"
   * table), machine-checked against the real dataset ids and, for every
   * `list-career-stories` case, against the `expectedCompetencies` the
   * runner actually asserts on a real tool-call trace — not prose.
   */
  describe("COMPETENCY_COVERAGE (#295 correction, finding 5)", () => {
    it("has exactly one entry per controlled competency, each naming at least one case", () => {
      const keys = Object.keys(COMPETENCY_COVERAGE).sort();
      expect(keys).toEqual([...COMPETENCIES].sort());
      for (const competency of COMPETENCIES) {
        expect(COMPETENCY_COVERAGE[competency].length).toBeGreaterThan(0);
      }
    });

    it("names only case ids that actually exist in STORY_MANIFEST_CASES", () => {
      const knownIds = new Set(STORY_MANIFEST_CASES.map((c) => c.id));
      for (const competency of COMPETENCIES) {
        for (const caseId of COMPETENCY_COVERAGE[competency]) {
          expect(knownIds.has(caseId)).toBe(true);
        }
      }
    });

    it("ties every list-career-stories case's asserted expectedCompetencies to the coverage table — a competency the runner actually scores that case's tool-call trace against, not documentation prose", () => {
      for (const evalCase of STORY_MANIFEST_CASES) {
        if (evalCase.expectedToolCall !== "list-career-stories") continue;
        for (const competency of evalCase.expectedCompetencies ?? []) {
          expect((COMPETENCIES as readonly string[]).includes(competency)).toBe(true);
          const coverage = COMPETENCY_COVERAGE[competency as Competency];
          expect(coverage).toContain(evalCase.id);
        }
      }
    });
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 1): a real repro against the actual dataset — not a synthetic
   * fixture — proving `story-manifest-*` coverage under CI's documented
   * default cap. `CI_DEFAULT_MAX_CASES` mirrors
   * `.github/workflows/agent-evals.yml`'s current `max_cases` input default
   * (`.github/**` is out of `packages/agent/**` scope, so this is a mirror
   * for regression purposes, not a link) — it must be kept in sync by hand
   * if that CI-owned default ever changes. Covering every one of the 38
   * manifest cases in a single default run still requires raising that
   * CI-owned cap toward `EVAL_CASES.length`, reported as the still-open
   * cross-package need on issue 295 rather than edited here.
   */
  it("exercises real story-manifest-* coverage under CI's current default 25-case budget cap, not zero (#295 correction, finding 1)", () => {
    const CI_DEFAULT_MAX_CASES = 25;
    const selected = selectCasesForBudget(EVAL_CASES, CI_DEFAULT_MAX_CASES);
    const coveredManifestIds = selected
      .filter((c) => c.id.startsWith("story-manifest-"))
      .map((c) => c.id);
    expect(coveredManifestIds.length).toBeGreaterThan(0);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 3): #295's "Story-specific factual-boundary assertions" section
   * requires "executable assertions for... the audited risks for stories
   * 001, 004, 008, 009, 010, 011, 014, 015, and 016" — not deferred as
   * follow-up. Each test below crafts an answer that otherwise satisfies
   * the case's citation requirement but crosses that one specific audited
   * boundary, and proves the case's own `answerAssertions` catches it.
   */
  describe("story-specific factual-boundary guards (#295 correction, finding 3)", () => {
    it("001 (xogito): the answer must not claim Marcos personally caused, won, or secured the client's later follow-on projects", () => {
      expectBoundaryViolationCaught(
        "story-manifest-f01",
        "He rebuilt the Xogito client relationship and personally won the client's next three " +
          "follow-on projects. [cite:story:xogito-client-account-recovery]",
      );
    });

    it("004 (communication-service-ownership): the answer must not call the ~70% observed outcome 'LLM accuracy'", () => {
      expectBoundaryViolationCaught(
        "story-manifest-f04",
        "He owns the communications service end to end, achieving 70% LLM accuracy on triage. " +
          "[cite:story:house-numbers-communication-service-ownership]",
      );
    });

    it("008 (secure-public-document-upload): the owner-estimated 'roughly two out of three' figure must never be presented as a formally measured percentage", () => {
      expectBoundaryViolationCaught(
        "story-manifest-x06",
        "He handled public sensitive-data uploads with a formally measured 67% failure rate. " +
          "[cite:story:house-numbers-secure-public-document-upload]",
      );
    });

    it("009 (zod-production-incident): the answer must never claim source documents were permanently lost and later recovered", () => {
      expectBoundaryViolationCaught(
        "story-manifest-x07",
        "The Zod upgrade caused a crash loop, and the documents were permanently lost and " +
          "recovered afterward. [cite:story:house-numbers-zod-production-incident]",
      );
    });

    it("010 (vendor-extraction-contract): the answer must never claim the original documents were lost, only that the provider's historical extraction was unavailable", () => {
      expectBoundaryViolationCaught(
        "story-manifest-x08",
        "He discovered the documents were lost when validating the vendor's data contract. " +
          "[cite:story:house-numbers-vendor-extraction-contract]",
      );
    });

    it("011 (loan-analysis-pipeline-decomposition): the answer must not invent a quantified performance improvement", () => {
      expectBoundaryViolationCaught(
        "story-manifest-f11",
        "He decomposed the pipeline proactively, delivering a measured 40% faster runtime. " +
          "[cite:story:house-numbers-loan-analysis-pipeline-decomposition]",
      );
    });

    it("014 (belatrix-destructive-deployment-accountability): the answer must never claim production or customer data was affected — only a shared development environment", () => {
      expectBoundaryViolationCaught(
        "story-manifest-x09",
        "The destructive deployment affected production data and customers directly. " +
          "[cite:story:belatrix-destructive-deployment-accountability]",
      );
    });

    it("015 (cross-service-debugging-skill): the answer must not describe autonomous learning or autonomous self-healing", () => {
      expectBoundaryViolationCaught(
        "story-manifest-f15",
        "The debugging skill improved through autonomous learning across services. " +
          "[cite:story:house-numbers-cross-service-debugging-skill]",
      );
    });

    it("016 (ai-pivot-after-paternity-leave): the answer must not claim impostor syndrome was clinically diagnosed", () => {
      expectBoundaryViolationCaught(
        "story-manifest-x10",
        "He adapted after paternity leave despite being clinically diagnosed with impostor " +
          "syndrome. [cite:story:house-numbers-ai-pivot-after-paternity-leave]",
      );
    });

    /**
     * #295 second independent-review correction (finding 3): "The
     * factual-boundary suite remains incomplete and is easy to bypass"
     * names four SPECIFIC violating answers that scored 1.0 against the
     * first correction's guards — a paraphrase around each narrow forbidden
     * phrase. Each case below reproduces the review's EXACT wording and
     * proves it is now caught, alongside a companion test proving the
     * honest, approved phrasing for that same story still passes (the
     * guard must catch the violation without becoming so broad it forbids
     * describing the story at all).
     */
    describe("paraphrase counterexamples from the second independent review", () => {
      it("001 (xogito): 'his leadership led the client to commission three additional projects' — causation attributed to Marcos via a verb the first guard's list didn't cover ('led ... to commission')", () => {
        expectBoundaryViolationCaught(
          "story-manifest-f01",
          "At Xogito, his leadership led the client to commission three additional projects. " +
            "[cite:story:xogito-client-account-recovery]",
        );
      });

      it("001 (xogito): the approved honest phrasing — the client, not Marcos, is the one who later commissioned further work — still passes", () => {
        const evalCase = requireCase("story-manifest-f01");
        const assertions = evalCase.answerAssertions;
        if (!assertions) throw new Error("expected answerAssertions");
        const result = scoreAnswerAssertions(
          "He rebuilt trust with the frustrated Xogito client through increased meeting cadence " +
            "and quick wins. The client later commissioned additional projects. " +
            "[cite:story:xogito-client-account-recovery]",
          assertions,
          [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
        );
        expect(result.score).toBe(1);
      });

      it("004 (communication-service-ownership): 'achieved about 70% effective triage because the LLM handled it' — attributes the outcome to the model alone, without saying 'LLM accuracy' verbatim", () => {
        expectBoundaryViolationCaught(
          "story-manifest-f04",
          "The communications workflow achieved about 70% effective triage because the LLM " +
            "handled it. [cite:story:house-numbers-communication-service-ownership]",
        );
      });

      it("004 (communication-service-ownership): the approved honest phrasing — the ~70% figure with its caveat, not attributed to the model alone — still passes", () => {
        const evalCase = requireCase("story-manifest-f04");
        const assertions = evalCase.answerAssertions;
        if (!assertions) throw new Error("expected answerAssertions");
        const result = scoreAnswerAssertions(
          "A recent seven-month snapshot showed roughly 70% of communications reaching an " +
            "observed effective-triage outcome; the rest includes spam, unsupported cases, and " +
            "an observability gap. [cite:story:house-numbers-communication-service-ownership]",
          assertions,
          [{ entityType: "story", entityId: "house-numbers-communication-service-ownership" }],
        );
        expect(result.score).toBe(1);
      });

      it("008 (secure-public-document-upload): 'was fully HIPAA compliant' — an invented regulatory-compliance claim the first guard's percentage/measured-rate patterns never checked for", () => {
        expectBoundaryViolationCaught(
          "story-manifest-x06",
          "The public upload workflow was fully HIPAA compliant. " +
            "[cite:story:house-numbers-secure-public-document-upload]",
        );
      });

      it("008 (secure-public-document-upload): the approved honest phrasing — security-by-design without any named regulatory regime — still passes", () => {
        const evalCase = requireCase("story-manifest-x06");
        const assertions = evalCase.answerAssertions;
        if (!assertions) throw new Error("expected answerAssertions");
        const result = scoreAnswerAssertions(
          "He redesigned the public upload workflow with security-by-design: minimizing what " +
            "crossed each boundary and retaining an audit trail. " +
            "[cite:story:house-numbers-secure-public-document-upload]",
          assertions,
          [{ entityType: "story", entityId: "house-numbers-secure-public-document-upload" }],
        );
        expect(result.score).toBe(1);
      });

      it("015 (cross-service-debugging-skill): 'learned from incidents and fixed itself' — an autonomous-self-healing claim phrased without the word 'autonomous' or 'self-healing'", () => {
        expectBoundaryViolationCaught(
          "story-manifest-f15",
          "The debugging skill learned from incidents and fixed itself. " +
            "[cite:story:house-numbers-cross-service-debugging-skill]",
        );
      });

      it("015 (cross-service-debugging-skill): the approved honest phrasing — engineers iterating a versioned skill from incident lessons — still passes", () => {
        const evalCase = requireCase("story-manifest-f15");
        const assertions = evalCase.answerAssertions;
        if (!assertions) throw new Error("expected answerAssertions");
        const result = scoreAnswerAssertions(
          "He converted the on-call debugging process into a versioned skill that engineers " +
            "improved after each incident. [cite:story:house-numbers-cross-service-debugging-skill]",
          assertions,
          [{ entityType: "story", entityId: "house-numbers-cross-service-debugging-skill" }],
        );
        expect(result.score).toBe(1);
      });
    });
  });

  it("carries no private personal data (no email addresses or phone-like digit runs)", () => {
    for (const evalCase of STORY_MANIFEST_CASES) {
      const text = `${evalCase.question} ${evalCase.notes ?? ""}`;
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    }
  });
});
