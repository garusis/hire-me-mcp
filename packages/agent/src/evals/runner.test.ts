import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "./budget.js";
import type { EvalCase } from "./dataset/schema.js";
import { runEvalSuite, selectCasesForBudget } from "./runner.js";

function makeCase(overrides: Partial<EvalCase> & Pick<EvalCase, "id">): EvalCase {
  return {
    category: "grounded",
    question: `Question for ${overrides.id}`,
    gapHonestyDirection: "claimed",
    ...overrides,
  };
}

const groundedCase = makeCase({ id: "grounded-1" });
const gapCase = makeCase({ id: "gap-1", category: "gap", gapHonestyDirection: "gap" });
const offTopicCase = makeCase({
  id: "off-topic-1",
  category: "off-topic",
  gapHonestyDirection: "n/a",
});

function stubRunCase(answer = "He built things [cite:skill:aws].") {
  return vi.fn().mockResolvedValue({
    answer,
    toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  });
}

const ragCase = makeCase({
  id: "rag-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "search-career",
});
const exactFactCase = makeCase({
  id: "exact-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "deterministic-only",
});
const storyScopedCase = makeCase({
  id: "story-scoped-1",
  category: "grounded",
  gapHonestyDirection: "claimed",
  expectedToolCall: "search-career-story-scoped",
});

describe("runEvalSuite", () => {
  it("runs every case up to the budget's case cap, scoring each with all applicable scorers", async () => {
    const runCase = stubRunCase();
    const report = await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(runCase).toHaveBeenCalledTimes(3);
    expect(report.cases).toHaveLength(3);
    // off-topic case has no gap-honesty direction — score is null
    const offTopicResult = report.cases.find((c) => c.id === "off-topic-1");
    expect(offTopicResult?.scores.gapHonesty).toBeNull();
    // grounded/gap cases do get a gap-honesty score
    const groundedResult = report.cases.find((c) => c.id === "grounded-1");
    expect(groundedResult?.scores.gapHonesty).not.toBeNull();
    expect(report.promptVersion).toBe("test-version");
    expect(report.modelId).toBe("gemini-3.6-flash");
  });

  it("never runs more cases than the budget's maxCases", async () => {
    const runCase = stubRunCase();
    await runEvalSuite(
      {
        cases: [groundedCase, gapCase, offTopicCase],
        budget: { maxCases: 2, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(runCase).toHaveBeenCalledTimes(2);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 1): a naive `cases.slice(0, maxCases)` silently drops every
   * `story-manifest-*` case whenever the dataset appends them after the
   * base cases and the budget cap falls short of the combined total — the
   * exact real-world shape of `./dataset/cases.ts` (28 base cases then 38
   * `story-manifest-*` cases) under CI's then-current 25-case default cap
   * (raised to the full 66-case dataset size by a later #295 integration
   * correction). A budget-capped run must proportionally cover every
   * id-prefix group present in the dataset, not just whichever group
   * happens to sort first — this still matters below any cap smaller than
   * the dataset (e.g. a `workflow_dispatch` override), regardless of what
   * CI's own current default is.
   */
  it("proportionally covers every case-id-prefix group under a budget cap, instead of a naive prefix slice that can silently drop an entire group", async () => {
    const runCase = stubRunCase();
    const baseCases = Array.from({ length: 6 }, (_, i) => makeCase({ id: `base-${i}` }));
    const manifestCases = Array.from({ length: 6 }, (_, i) =>
      makeCase({ id: `story-manifest-${i}` }),
    );

    await runEvalSuite(
      {
        cases: [...baseCases, ...manifestCases],
        budget: { maxCases: 4, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const askedQuestions = runCase.mock.calls.map(([question]) => question as string);
    expect(askedQuestions.some((q) => q.includes("story-manifest-"))).toBe(true);
    expect(askedQuestions.some((q) => q.includes("base-"))).toBe(true);
  });

  it("exports selectCasesForBudget so the real dataset's default-run coverage can be regression-tested directly (#295 correction, finding 1/5)", () => {
    const cases = [
      ...Array.from({ length: 3 }, (_, i) => makeCase({ id: `base-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => makeCase({ id: `story-manifest-${i}` })),
    ];
    const selected = selectCasesForBudget(cases, 2);
    expect(selected).toHaveLength(2);
    expect(selected.some((c) => c.id.startsWith("story-manifest-"))).toBe(true);
  });

  it("aborts loudly with BudgetExceededError when the token budget is exceeded mid-run, without silently truncating", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100_000, outputTokens: 100_000, totalTokens: 200_000 },
    });
    await expect(
      runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 250_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      ),
    ).rejects.toThrow(BudgetExceededError);

    // Aborted after the second case pushed cumulative tokens past the cap —
    // never reached the third.
    expect(runCase).toHaveBeenCalledTimes(2);
  });

  it("does not throttle between cases itself — rate limiting lives at the model boundary (#282)", async () => {
    // Fake timers that are never advanced: if this runner still slept
    // between cases (the pre-#282 per-case throttle, which counted cases
    // rather than the 2-3 real requests each one makes), the awaited run
    // would hang here instead of completing.
    vi.useFakeTimers();
    try {
      const runCase = stubRunCase();

      const report = await runEvalSuite(
        {
          cases: [groundedCase, gapCase, offTopicCase],
          budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
          promptVersion: "test-version",
          modelId: "gemini-3.6-flash",
        },
        { runCase },
      );

      expect(runCase).toHaveBeenCalledTimes(3);
      expect(report.cases).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scores answerAssertions when a case declares them, and leaves the score null otherwise (#300)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "The extraction work was a proof of concept; accuracy went from 30% to 87% [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const assertedCase = makeCase({
      id: "poc-1",
      answerAssertions: {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["30%\\s*to\\s*87%"],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [assertedCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const asserted = report.cases.find((c) => c.id === "poc-1");
    expect(asserted?.scores.answerAssertions?.score).toBe(0.5);
    const plain = report.cases.find((c) => c.id === "grounded-1");
    expect(plain?.scores.answerAssertions).toBeNull();
  });

  it("scores toolRouting when a case declares expectedToolCall, using the run's toolCalls (#75, #294)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: undefined }],
    });
    const report = await runEvalSuite(
      {
        cases: [ragCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const ragResult = report.cases.find((c) => c.id === "rag-1");
    expect(ragResult?.scores.toolRouting).toEqual({
      score: 1,
      reason: expect.stringContaining("search-career"),
    });
  });

  it("scores toolRouting 0 when a deterministic-only case's run actually called search-career (#75)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He built things [cite:skill:aws].",
      toolCitations: [{ entityType: "skill" as const, entityId: "aws" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: undefined }],
    });
    const report = await runEvalSuite(
      {
        cases: [exactFactCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases.find((c) => c.id === "exact-1")?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 0 for a search-career-story-scoped case when the run's search-career call carries no sourceTypes (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "search-career", args: { query: "leadership" } }],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 for a search-career-story-scoped case when the run's search-career call carries sourceTypes: ['story'] (#294)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        { toolName: "search-career", args: { query: "leadership", sourceTypes: ["story"] } },
        { toolName: "list-career-stories", args: { id: "xogito-client-account-recovery" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("passes the run's answer into scoreToolRouting so an unlabeled fallback after an empty story-scoped search scores 0 (fourth #294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He led a related effort at Acme: [cite:experience:acme].",
      toolCitations: [{ entityType: "experience" as const, entityId: "acme" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "search-career",
          args: { query: "leadership", sourceTypes: ["story"] },
          citations: [],
        },
        { toolName: "search-career", args: { query: "leadership" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 when the run's answer honestly labels a fallback after an empty story-scoped search (fourth #294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "No direct story supports that behavior. The closest related evidence, not itself a behavioral event, is [cite:experience:acme].",
      toolCitations: [{ entityType: "experience" as const, entityId: "acme" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        {
          toolName: "search-career",
          args: { query: "leadership", sourceTypes: ["story"] },
          citations: [],
        },
        { toolName: "search-career", args: { query: "leadership" } },
      ],
    });
    const report = await runEvalSuite(
      {
        cases: [storyScopedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("leaves toolRouting null when a case does not declare expectedToolCall — backward compatible", async () => {
    const runCase = stubRunCase();
    const report = await runEvalSuite(
      {
        cases: [groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting).toBeNull();
  });

  it("scores mustCiteEntity against the [cite:...] markers actually present in the answer text, not just that the text mentions the entity by name (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He rebuilt client trust at Xogito [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const citedCase = makeCase({
      id: "cited-1",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
        mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [citedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.answerAssertions?.score).toBe(1);
  });

  it("scores answerAssertions 0 when the answer text lacks the required citation marker, even though it names the entity in prose (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He rebuilt client trust at Xogito.",
      toolCitations: [{ entityType: "recommendation" as const, entityId: "some-other-rec" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const citedCase = makeCase({
      id: "cited-2",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [citedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.answerAssertions?.score).toBe(0);
  });

  /**
   * #294 independent-review correction (finding 2): a `list-career-stories`
   * case can declare `expectedCompetencies` — the located call's
   * `competencies` argument must contain every listed value AND the call
   * must precede any `search-career` call in the trace. Tool-name presence
   * alone (the pre-correction check) accepted an empty-args call or one
   * made after a `search-career` fallback.
   */
  it("scores toolRouting 0 for a list-career-stories case with expectedCompetencies when the located call's competencies argument omits the required value (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "list-career-stories", args: { competencies: ["ownership"] } }],
    });
    const competencyCase = makeCase({
      id: "competency-1",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 0 for a list-career-stories case when a search-career call precedes the list-career-stories call, even with a matching competency (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [
        { toolName: "search-career", args: { query: "leadership" } },
        { toolName: "list-career-stories", args: { competencies: ["leadership"] } },
      ],
    });
    const competencyCase = makeCase({
      id: "competency-2",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(0);
  });

  it("scores toolRouting 1 for a list-career-stories case whose located call carries the required competency and precedes any search-career call (#294 independent-review correction)", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer: "He does this by [cite:story:xogito-client-account-recovery].",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      toolCalls: [{ toolName: "list-career-stories", args: { competencies: ["leadership"] } }],
    });
    const competencyCase = makeCase({
      id: "competency-3",
      expectedToolCall: "list-career-stories",
      expectedCompetencies: ["leadership"],
    });
    const report = await runEvalSuite(
      {
        cases: [competencyCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  it("treats a missing toolCalls field on the run result as an empty trace, not a crash (backward compatible with pre-#75 runCase stubs)", async () => {
    const runCase = stubRunCase(); // no toolCalls field at all
    const report = await runEvalSuite(
      {
        cases: [exactFactCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    // deterministic-only + empty trace = trivially satisfied
    expect(report.cases[0]?.scores.toolRouting?.score).toBe(1);
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 4): `runEvalSuite` must thread the run's actual `toolCitations`
   * into `scoreAnswerAssertions` so a `citationGroups` `preferredRef` check
   * only fails when the preferred source was really returned by a tool that
   * turn — not unconditionally whenever an honest alternative is cited.
   */
  it("passes the run's toolCitations through to the preferred-source check, so citing an honest alternative only fails when the preferred source was actually returned this turn", async () => {
    const preferredNotReturned = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [{ entityType: "story" as const, entityId: "mutual-informal-leadership" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const preferredCase = makeCase({
      id: "preferred-1",
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
    const reportWithoutPreferred = await runEvalSuite(
      {
        cases: [preferredCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase: preferredNotReturned },
    );
    expect(reportWithoutPreferred.cases[0]?.scores.answerAssertions?.score).toBe(1);

    const preferredReturned = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [
        { entityType: "story" as const, entityId: "xogito-client-account-recovery" },
        { entityType: "story" as const, entityId: "mutual-informal-leadership" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const reportWithPreferred = await runEvalSuite(
      {
        cases: [preferredCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase: preferredReturned },
    );
    expect(reportWithPreferred.cases[0]?.scores.answerAssertions?.score).toBe(0);
  });

  /**
   * #295 second independent-review correction (finding 4): `runEvalSuite`
   * must score `preferredSourceCompliance` independently
   * (`./scorers/answer-assertions.ts`'s `scorePreferredSourceCompliance`)
   * for any case declaring a `citationGroups.preferredRef`, and leave it
   * `null` for a case that declares no preference at all.
   */
  it("scores preferredSourceCompliance independently of answerAssertions, and leaves it null for a case with no declared preference", async () => {
    const preferredCase = makeCase({
      id: "preferred-2",
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
    const runCase = vi.fn().mockResolvedValue({
      answer: "[cite:story:mutual-informal-leadership]",
      toolCitations: [
        { entityType: "story" as const, entityId: "xogito-client-account-recovery" },
        { entityType: "story" as const, entityId: "mutual-informal-leadership" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [preferredCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const preferredReport = report.cases.find((c) => c.id === "preferred-2");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    expect(preferredReport?.scores.preferredSourceCompliance?.score).toBe(0);
    expect(plainReport?.scores.preferredSourceCompliance).toBeNull();
  });

  /**
   * #295 third-independent-review correction (finding 1): `runEvalSuite`
   * must score `factualBoundaryCompliance` independently
   * (`./scorers/answer-assertions.ts`'s `scoreFactualBoundaryCompliance`)
   * for any case declaring `mustMatch`/`mustNotMatch`/`conditionalMustMatch`,
   * as a BINARY pass/fail — not diluted by other passing assertions in the
   * same case — and leave it `null` for a case that declares none of those.
   */
  it("scores factualBoundaryCompliance independently and blocking, and leaves it null for a case with no text/caveat boundary declared", async () => {
    const boundaryCase = makeCase({
      id: "boundary-1",
      answerAssertions: {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["shipped to production"],
      },
    });
    const runCase = vi.fn().mockResolvedValue({
      answer: "This was shipped to production, not a proof of concept.",
      toolCitations: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [boundaryCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const boundaryReport = report.cases.find((c) => c.id === "boundary-1");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    // mustMatch holds (the answer does mention "proof of concept"), but
    // mustNotMatch is violated ("shipped to production") — one violation
    // out of two assertions must still fail this BINARY score outright
    // (0), not the diluted 0.5 scoreAnswerAssertions would report.
    expect(boundaryReport?.scores.factualBoundaryCompliance?.score).toBe(0);
    expect(plainReport?.scores.factualBoundaryCompliance).toBeNull();
  });

  /**
   * #295 correction (independent Codex review, agent package `1dd7ac7`,
   * finding 2): `runEvalSuite` must score behavioral-story completeness
   * (`./scorers/story-completeness.ts`) for any case that declares a
   * citation-based `answerAssertions` (`mustCiteEntity`/`citationGroups` —
   * a case expecting a complete story, not a generic base-dataset check),
   * and leave it `null` for a case that doesn't.
   */
  it("scores storyCompleteness when a case declares citation-based answerAssertions, and leaves it null otherwise", async () => {
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "After the project manager resigned, the client was deeply frustrated with progress. " +
        "Marcos increased the meeting cadence and delivered quick wins alongside the core repairs. " +
        "As a result, trust returned and the client later commissioned additional projects. " +
        "[cite:story:xogito-client-account-recovery]",
      toolCitations: [{ entityType: "story" as const, entityId: "xogito-client-account-recovery" }],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const storyCase = makeCase({
      id: "story-1",
      answerAssertions: {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      },
    });
    const report = await runEvalSuite(
      {
        cases: [storyCase, groundedCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const storyReport = report.cases.find((c) => c.id === "story-1");
    const plainReport = report.cases.find((c) => c.id === groundedCase.id);
    expect(storyReport?.scores.storyCompleteness?.score).toBe(1);
    expect(plainReport?.scores.storyCompleteness).toBeNull();
  });

  /**
   * #295 third-independent-review correction, finding 3: a `citationGroups`
   * entry with `mode: "all"` (cross-cutting) must score story completeness
   * with `"all"` semantics — full coverage required for EVERY listed
   * story, not a best-of-one match — while an `"any"` group (or a plain
   * `mustCiteEntity`) still uses best-of-cited-and-acceptable semantics.
   */
  it("scores storyCompleteness with 'all' semantics for a cross-cutting citationGroups entry — a bare extra citation with no facts fails the case", async () => {
    const crossCuttingCase = makeCase({
      id: "cross-cutting-1",
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
    const runCase = vi.fn().mockResolvedValue({
      answer:
        "The legacy SAP financial calculations needed migrating. Marcos wrote ETL scripts to " +
        "handle rounding differences. The migration completed without data loss, drawing on " +
        "legacy-system experts. [cite:story:fullstack-labs-sap-migration] " +
        "[cite:story:house-numbers-secure-public-document-upload]",
      toolCitations: [
        { entityType: "story" as const, entityId: "fullstack-labs-sap-migration" },
        { entityType: "story" as const, entityId: "house-numbers-secure-public-document-upload" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const report = await runEvalSuite(
      {
        cases: [crossCuttingCase],
        budget: { maxCases: 10, maxTotalTokens: 1_000_000, maxCostUsd: 100 },
        promptVersion: "test-version",
        modelId: "gemini-3.6-flash",
      },
      { runCase },
    );

    const crossCuttingReport = report.cases.find((c) => c.id === "cross-cutting-1");
    // SAP is fully narrated (score 1); the public-upload story is only
    // bare-cited with no facts (score 0) — "all" mode must take the WORST,
    // not the best, so the case-level score is 0, not 1.
    expect(crossCuttingReport?.scores.storyCompleteness?.score).toBe(0);
  });

  /**
   * #295 integration correction (independent review, finding 3): this
   * module's own doc comments described CI's default cap as 25 and the
   * cross-package ask to raise it as still unresolved, even after
   * `agent-evals.yml`/`release-readiness.yml` were raised to 66 elsewhere
   * in the same correction. Regression, not just a one-time prose fix, so
   * the doc comments can't silently drift stale again.
   */
  it("doesn't describe CI's default cap using the stale pre-#295 25-case figure (#295 integration correction, finding 3)", () => {
    const runnerSource = readFileSync(
      fileURLToPath(new URL("./runner.ts", import.meta.url)),
      "utf8",
    );
    expect(runnerSource).not.toMatch(/CI's current 25-case/);
  });
});
