import { describe, expect, it } from "vitest";
import { scoreAnswerAssertions } from "../scorers/answer-assertions.js";
import { EVAL_CASES } from "./cases.js";
import { evalDatasetSchema } from "./schema.js";

describe("EVAL_CASES", () => {
  it("validates against the dataset schema", () => {
    const result = evalDatasetSchema.safeParse(EVAL_CASES);
    expect(result.success).toBe(true);
  });

  it("has at least two cases in every category", () => {
    const counts = new Map<string, number>();
    for (const evalCase of EVAL_CASES) {
      counts.set(evalCase.category, (counts.get(evalCase.category) ?? 0) + 1);
    }
    for (const category of ["grounded", "gap", "off-topic", "injection"]) {
      expect(counts.get(category) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("has unique ids", () => {
    const ids = EVAL_CASES.map((evalCase) => evalCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes at least three fuzzy/cross-cutting cases expecting search-career to be called (#75)", () => {
    const ragCases = EVAL_CASES.filter((c) => c.expectedToolCall === "search-career");
    expect(ragCases.length).toBeGreaterThanOrEqual(3);
  });

  it("includes at least one absent-topic gap case expecting search-career to be called (#75)", () => {
    const ragGapCases = EVAL_CASES.filter(
      (c) => c.category === "gap" && c.expectedToolCall === "search-career",
    );
    expect(ragGapCases.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one exact-fact case expecting deterministic-only routing (#75)", () => {
    const exactCases = EVAL_CASES.filter((c) => c.expectedToolCall === "deterministic-only");
    expect(exactCases.length).toBeGreaterThanOrEqual(1);
  });

  it("includes at least one known-competency behavioral case expecting list-career-stories to be called (#294)", () => {
    const storyCases = EVAL_CASES.filter((c) => c.expectedToolCall === "list-career-stories");
    expect(storyCases.length).toBeGreaterThanOrEqual(1);
    for (const evalCase of storyCases) {
      expect(evalCase.question).toMatch(/tell me about a time|leadership|led|ownership/i);
    }
  });

  it("includes at least one fuzzy behavioral case expecting search-career (story-scoped) routing (#294)", () => {
    const fuzzyStoryCase = EVAL_CASES.find(
      (c) => c.id === "rag-stalled-project-no-formal-authority",
    );
    expect(fuzzyStoryCase).toBeDefined();
    expect(fuzzyStoryCase?.expectedToolCall).toBe("search-career");
    expect(fuzzyStoryCase?.notes).toMatch(/sourceTypes.*story|story.*sourceTypes/is);
  });

  it("probes the document-extraction PoC status with answer assertions that reject the withdrawn production framing (#300)", () => {
    const pocCases = EVAL_CASES.filter((c) => c.id.startsWith("poc-doc-extraction-"));
    expect(pocCases.length).toBeGreaterThanOrEqual(3);
    for (const evalCase of pocCases) {
      expect(evalCase.answerAssertions).toBeDefined();
      expect(evalCase.answerAssertions?.mustNotMatch?.length ?? 0).toBeGreaterThan(0);
    }
    const demoToProduction = EVAL_CASES.find((c) => c.id === "rag-ai-demo-to-production");
    expect(demoToProduction?.notes).not.toMatch(/document-extraction-pipeline/);
  });

  /**
   * The PoC assertions must not be negation-blind (#300 review): an honest
   * answer naturally echoes the question's own phrasing under a negation
   * ("it was not shipped to production", "the 3% of its cost claim is
   * invalid") and has to score 1, while the withdrawn affirmative framing
   * still fails.
   */
  describe("document-extraction PoC answer assertions (#300)", () => {
    function assertionsFor(id: string) {
      const evalCase = EVAL_CASES.find((c) => c.id === id);
      const assertions = evalCase?.answerAssertions;
      if (!assertions) {
        throw new Error(`eval case ${id} must declare answerAssertions`);
      }
      return assertions;
    }

    const HONEST_ANSWERS: ReadonlyArray<readonly [id: string, answer: string]> = [
      [
        "poc-doc-extraction-production-status",
        "No — it was not shipped to production. The document-extraction work was a multi-round " +
          "proof of concept; production kept the incumbent OCR vendor plus the existing LLM " +
          "fallback, and productionization was explicitly left as a later team decision.",
      ],
      [
        "poc-doc-extraction-production-status",
        "It never reached production. The PoC stayed experimental under the evaluation harness; " +
          "it was never deployed and never replaced the vendor.",
      ],
      [
        "poc-doc-extraction-demonstrated",
        "The proof of concept demonstrated measured experimentation rather than a shipped " +
          "system: competing split, classify and extract architectures were scored against " +
          "human-reviewed ground truth, with stated limitations — a corrected 0.728 field " +
          "result on a 17-document judged sample and 74.7% correctness among scored fields at " +
          "only 48.0% coverage. It was not deployed.",
      ],
      [
        "poc-doc-extraction-vendor-cost-claim",
        "No. The claim that it beat the vendor at 3% of its cost is invalid: the PoC's cost " +
          "figures are experiment-run costs, never normalized against the vendor's per-loan " +
          "price on the same work and coverage, and it never replaced the vendor. Andre Treib's " +
          'recommendation does mention "$0.30 vs $25", but that is his attributed wording, ' +
          "not a measured result.",
      ],
    ];

    it.each(HONEST_ANSWERS)(
      "scores an honest, negated answer to %s as fully passing",
      (id, answer) => {
        const result = scoreAnswerAssertions(answer, assertionsFor(id));
        expect(result.reason).not.toMatch(/forbidden pattern matched|missing required pattern/);
        expect(result.score).toBe(1);
      },
    );

    const WITHDRAWN_ANSWERS: ReadonlyArray<readonly [id: string, answer: string]> = [
      [
        "poc-doc-extraction-production-status",
        "Yes — he shipped it to production, where it replaced the incumbent vendor.",
      ],
      [
        "poc-doc-extraction-production-status",
        "Yes, the pipeline was deployed to production and accuracy went from 30% to 87%.",
      ],
      [
        "poc-doc-extraction-demonstrated",
        "It demonstrated a jump from 30% → 87% accuracy and a 0.844 field score.",
      ],
      [
        "poc-doc-extraction-vendor-cost-claim",
        "Yes — it beat the vendor at roughly 3% of its cost, going from 30% to 87%.",
      ],
    ];

    it.each(WITHDRAWN_ANSWERS)("rejects the withdrawn affirmative framing for %s", (id, answer) => {
      expect(scoreAnswerAssertions(answer, assertionsFor(id)).score).toBeLessThan(1);
    });
  });

  it("carries no private personal data (no email addresses or phone-like digit runs)", () => {
    for (const evalCase of EVAL_CASES) {
      const text = `${evalCase.question} ${evalCase.notes ?? ""}`;
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    }
  });
});
