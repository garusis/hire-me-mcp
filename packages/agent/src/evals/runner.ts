/**
 * Eval suite runner (#72): executes dataset cases against the real agent,
 * captures the answer + tool citations + token usage each case produced,
 * scores each with the three scorers, enforces the case/budget caps, and
 * assembles the final machine-readable report (`./report.ts`).
 *
 * ## Dependency injection — the zero-model-call test seam
 *
 * `runEvalSuite`'s SECOND argument, `RunnerDeps`, is where a real model
 * call lives — `runCase(question)` is expected to call the real
 * `getInterviewAgent().generate(question)` and shape its result into
 * `{ answer, toolCitations, usage }` (see `./cli.ts`, the only place that
 * wires a real implementation). `runner.test.ts` injects a stub instead —
 * same `MockLanguageModelV4`-flavored pattern the rest of this package
 * uses (`../interview-agent.test.ts`) — so this module's own test suite
 * makes zero real model calls while still exercising the full budget-abort
 * and case-cap logic for real.
 *
 * `sleep` is injected the same way, so the RPM throttle below never
 * touches a real timer in tests.
 *
 * ## Budget enforcement
 *
 * Cases run at most `budget.maxCases` times — case count is a fact known
 * ahead of time, so this is a simple slice, not a thrown abort. Token/cost
 * usage is NOT known ahead of time (a model's real answer length varies),
 * so after every case's usage is tallied, `assertWithinBudget`
 * (`./budget.ts`) is checked; the instant either cap is crossed, the run
 * throws `BudgetExceededError` and stops — no further cases run, and the
 * caller (`./cli.ts`) never gets a "successful" report for a run that
 * overspent its budget.
 *
 * ## RPM throttle
 *
 * Verified against the AI Studio dashboard (`packages/agent/README.md`'s
 * quota rationale table): the default model, `gemini-3.5-flash-lite`, gets
 * 15 RPM / 500 RPD on the free tier. `rpmLimit` (default 10) stays a
 * polite margin under that 15 RPM ceiling rather than running right up
 * against it; it converts to a minimum delay between calls, and the
 * throttle sleeps BEFORE every case after the first, never after the last
 * (no pointless trailing wait once the run is done).
 */

import {
  assertWithinBudget,
  type BudgetConfig,
  estimateCostUsd,
  getModelPricing,
} from "./budget.js";
import type { EvalCase } from "./dataset/schema.js";
import { buildReport, type CaseReport, type EvalReport } from "./report.js";
import {
  scoreGapHonesty,
  scoreGroundedness,
  scoreRelevance,
  scoreToolRouting,
} from "./scorers/index.js";
import type { ReturnedCitation } from "./scorers/types.js";
import type { ScorerThresholds } from "./thresholds.js";

/** One case's captured real-agent run — the shape `RunnerDeps.runCase` must return. */
export interface CaseRunResult {
  answer: string;
  toolCitations: ReturnedCitation[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  /**
   * Every tool name called during this run's `agent.generate()`, in call
   * order (duplicates allowed) — the trace `scoreToolRouting` (#75) checks
   * a case's `expectedToolCall` against. Optional and defaults to an empty
   * trace when omitted, so a `RunnerDeps.runCase` stub written before #75
   * (this field's introduction) keeps compiling and running unchanged;
   * `./cli.ts`'s real implementation always supplies it.
   */
  toolCallNames?: string[];
}

/** Injected dependencies — the real-call and real-timer seam. See module docs. */
export interface RunnerDeps {
  runCase: (question: string) => Promise<CaseRunResult>;
  sleep?: (ms: number) => Promise<void>;
}

/** Configuration for one eval suite run. */
export interface RunnerConfig {
  cases: readonly EvalCase[];
  budget: BudgetConfig;
  promptVersion: string;
  modelId: string;
  thresholds?: ScorerThresholds;
  /** Requests-per-minute ceiling used to throttle between real calls. Defaults to 10 — conservative for Gemini's free tier. */
  rpmLimit?: number;
}

const DEFAULT_RPM_LIMIT = 10;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scoreCase(evalCase: EvalCase, run: CaseRunResult): CaseReport {
  const transcript = {
    question: evalCase.question,
    answer: run.answer,
    toolCitations: run.toolCitations,
  };
  const gapHonesty =
    evalCase.gapHonestyDirection === "n/a"
      ? null
      : scoreGapHonesty(transcript, evalCase.gapHonestyDirection);
  const toolRouting =
    evalCase.expectedToolCall === undefined
      ? null
      : scoreToolRouting(run.toolCallNames ?? [], evalCase.expectedToolCall);

  return {
    id: evalCase.id,
    category: evalCase.category,
    question: evalCase.question,
    answer: run.answer,
    scores: {
      groundedness: scoreGroundedness(transcript, evalCase.category),
      gapHonesty,
      relevance: scoreRelevance(transcript),
      toolRouting,
    },
  };
}

/** Run the eval suite: execute up to `config.budget.maxCases` dataset cases against the real agent (via `deps.runCase`), score each, and assemble the final report. Throws `BudgetExceededError` (see `./budget.ts`) the instant the token or cost cap is crossed. */
export async function runEvalSuite(config: RunnerConfig, deps: RunnerDeps): Promise<EvalReport> {
  const sleep = deps.sleep ?? defaultSleep;
  const rpmLimit = config.rpmLimit ?? DEFAULT_RPM_LIMIT;
  const minIntervalMs = Math.ceil(60_000 / rpmLimit);
  const pricing = getModelPricing(config.modelId);

  const casesToRun = config.cases.slice(0, config.budget.maxCases);
  const caseReports: CaseReport[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const [index, evalCase] of casesToRun.entries()) {
    if (index > 0) {
      await sleep(minIntervalMs);
    }

    const run = await deps.runCase(evalCase.question);
    caseReports.push(scoreCase(evalCase, run));

    inputTokens += run.usage.inputTokens;
    outputTokens += run.usage.outputTokens;
    totalTokens += run.usage.totalTokens;
    costUsd += estimateCostUsd(run.usage, pricing);

    assertWithinBudget(config.budget, {
      casesRun: index + 1,
      totalTokens,
      costUsd,
    });
  }

  return buildReport({
    promptVersion: config.promptVersion,
    modelId: config.modelId,
    cases: caseReports,
    totals: { inputTokens, outputTokens, totalTokens, costUsd },
    thresholds: config.thresholds,
  });
}
