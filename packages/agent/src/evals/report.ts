/**
 * Machine-readable eval report (#72): "emits a machine-readable report
 * containing per-case scores, per-scorer aggregates, prompt version, model
 * id, and total cost/tokens." `buildReport` is a pure function — the
 * runner (`./runner.ts`) does the real agent calls and scoring, then hands
 * the collected `CaseReport[]` + totals here to assemble the final,
 * JSON-serializable report and compute the pass/fail verdict
 * (`./thresholds.ts`). Pure means this module's own tests need zero model
 * calls, on injected fixture case results.
 */

import type { EvalCaseCategory } from "./dataset/schema.js";
import type { RetryAttemptRecord } from "./retry.js";
import type { ToolCall } from "./scorers/tool-routing.js";
import type { ScoreResult } from "./scorers/types.js";
import type { ScorerThresholds, Verdict } from "./thresholds.js";
import { EVAL_THRESHOLDS, evaluateVerdict } from "./thresholds.js";

/**
 * One case's scored result — `gapHonesty` is `null` for categories that
 * don't probe either gap-honesty direction (off-topic, injection — see
 * `./dataset/cases.ts`). `toolRouting` (#75) is `null` for any case that
 * doesn't declare `EvalCase.expectedToolCall` — most of the dataset.
 */
export interface CaseReport {
  id: string;
  category: EvalCaseCategory;
  question: string;
  answer: string;
  scores: {
    groundedness: ScoreResult;
    gapHonesty: ScoreResult | null;
    relevance: ScoreResult;
    toolRouting: ScoreResult | null;
    /** `null` for any case that declares no `EvalCase.answerAssertions` (#300). */
    answerAssertions: ScoreResult | null;
    /**
     * `null` for any case the runner doesn't score for behavioral-story
     * completeness (#295 correction, finding 2 —
     * `./scorers/story-completeness.ts`).
     */
    storyCompleteness: ScoreResult | null;
    /**
     * `null` for any case whose `answerAssertions.citationGroups` declares
     * no `preferredRef` (#295 second independent-review correction, finding
     * 4 — `./scorers/answer-assertions.ts`'s `scorePreferredSourceCompliance`).
     * Reported and thresholded independently of `answerAssertions` so a
     * failed preference cannot be diluted by other passing assertions.
     */
    preferredSourceCompliance: ScoreResult | null;
    /**
     * `null` for any case that declares no `mustMatch`/`mustNotMatch`/
     * `conditionalMustMatch` entry (#295 third-independent-review
     * correction, finding 1 —
     * `./scorers/answer-assertions.ts`'s `scoreFactualBoundaryCompliance`).
     * Reported and thresholded independently of `answerAssertions` — a
     * BINARY pass/fail per case — so a single factual-boundary violation
     * cannot be diluted by other passing assertions in the same case.
     */
    factualBoundaryCompliance: ScoreResult | null;
  };
  /**
   * The run's own tool-call trace (#307 track 2): every tool call made
   * while producing this case's answer, in call order — order IS the
   * returned-result rank — carrying only the tool name, the arguments the
   * model supplied, and that call's own returned citation/source ids
   * (`./scorers/tool-routing.js`'s `ToolCall`). Deliberately compact: no
   * full result bodies, no secrets, nothing beyond what distinguishes "the
   * story was never retrieved" from "it was returned and the model ignored
   * it". Optional on input (a case built before this field existed, or a
   * run whose `toolCalls` was omitted) and always normalized to `[]` — never
   * `undefined` — in the assembled report.
   */
  toolTrace?: ToolCall[];
  /**
   * Every attempt `./retry.ts`'s `onAttempt` recorded for this case's own
   * request(s), in order (#307 second independent-review correction,
   * finding 4) — persisted for a successful case too, not just a failed
   * one (`FailedCaseReport.attempts` below already covered failures).
   * Optional on input and always normalized to `[]` — never `undefined` —
   * in the assembled report, the same treatment `toolTrace` gets above.
   */
  attempts?: RetryAttemptRecord[];
}

/**
 * A case that never produced a score because its provider call failed
 * terminally (#307 C5 — see `./retry.ts`'s module docs for what "terminal"
 * means: a 429, a permanent error, exhausted transient retries, or a
 * deadline). Carries the sanitized error info plus the full per-attempt
 * trace `./retry.ts`'s `onAttempt` recorded for this case's own request(s)
 * — never a raw provider error object, never a fabricated score.
 */
export interface FailedCaseReport {
  id: string;
  category: EvalCaseCategory;
  question: string;
  statusCode?: number;
  errorName?: string;
  errorMessage: string;
  attempts: RetryAttemptRecord[];
}

/**
 * A budget cap (case/token/cost) crossed mid-run, stopping the suite (#307
 * second independent-review correction, finding 5) — `message` is
 * `BudgetExceededError.message` (`./budget.ts`), already a safe, sanitized
 * string (it names only configured caps and counted numbers, never a raw
 * provider error). Distinct from {@link FailedCaseReport}: a budget overage
 * is the RUNNER's own decision to stop, not a case's provider call failing.
 */
export interface BudgetStopInfo {
  message: string;
}

/** A per-scorer aggregate: the mean score over every case the scorer applied to, and how many cases that was. */
export interface ScorerAggregate {
  mean: number;
  count: number;
}

/** Token/cost totals accumulated across every case run this eval, plus the case count. */
export interface EvalTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** The full machine-readable eval report — see module docs for the required fields (#72's acceptance criteria). */
export interface EvalReport {
  promptVersion: string;
  modelId: string;
  generatedAt: string;
  cases: CaseReport[];
  aggregates: {
    groundedness: ScorerAggregate;
    gapHonesty: ScorerAggregate;
    relevance: ScorerAggregate;
    toolRouting: ScorerAggregate;
    answerAssertions: ScorerAggregate;
    storyCompleteness: ScorerAggregate;
    preferredSourceCompliance: ScorerAggregate;
    factualBoundaryCompliance: ScorerAggregate;
  };
  totals: EvalTotals & { cases: number };
  thresholds: ScorerThresholds;
  verdict: Verdict;
  /**
   * Every case that failed terminally and stopped the suite (#307 C5) —
   * empty when the run completed every selected case. The runner stops at
   * the FIRST terminal failure (no continuing suite), so this is at most
   * one entry today; typed as an array so a report consumer never needs a
   * separate "did anything fail" check.
   */
  failedCases: FailedCaseReport[];
  /**
   * Ids of every selected case that never ran because the suite stopped on
   * a terminal failure before reaching it (#307 C5) — empty on a completed
   * run. Order matches dataset/selection order.
   */
  unexecutedCaseIds: string[];
  /**
   * `false` whenever `failedCases` or `unexecutedCaseIds` is non-empty, or
   * `budgetExceeded` is set — i.e. this report reflects a partial run, not
   * the full selected case set. Deliberately top-level (not folded into
   * `totals`) so existing totals-shape assertions aren't disturbed by this
   * addition.
   */
  complete: boolean;
  /**
   * Set when a configured case/token/cost budget was crossed mid-run,
   * stopping the suite (#307 second independent-review correction, finding
   * 5) — `null` on a completed run. Distinct from `failedCases`: this is
   * the runner's own decision to stop, not a case's provider call failing.
   */
  budgetExceeded: BudgetStopInfo | null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregate(scores: Array<ScoreResult | null>): ScorerAggregate {
  const applicable = scores.filter((score): score is ScoreResult => score !== null);
  return { mean: mean(applicable.map((score) => score.score)), count: applicable.length };
}

/** Assemble the final {@link EvalReport} from collected per-case results and run totals. Pure — no model calls, no I/O. */
export function buildReport(params: {
  promptVersion: string;
  modelId: string;
  cases: CaseReport[];
  totals: EvalTotals;
  thresholds?: ScorerThresholds;
  generatedAt?: string;
  /** See {@link EvalReport.failedCases}. Defaults to `[]` (a completed run). */
  failedCases?: FailedCaseReport[];
  /** See {@link EvalReport.unexecutedCaseIds}. Defaults to `[]` (a completed run). */
  unexecutedCaseIds?: string[];
  /** See {@link EvalReport.budgetExceeded}. Defaults to `null` (a completed run). */
  budgetExceeded?: BudgetStopInfo;
}): EvalReport {
  const thresholds = params.thresholds ?? EVAL_THRESHOLDS;
  const failedCases = params.failedCases ?? [];
  const unexecutedCaseIds = params.unexecutedCaseIds ?? [];
  const budgetExceeded = params.budgetExceeded ?? null;
  const aggregates = {
    groundedness: aggregate(params.cases.map((c) => c.scores.groundedness)),
    gapHonesty: aggregate(params.cases.map((c) => c.scores.gapHonesty)),
    relevance: aggregate(params.cases.map((c) => c.scores.relevance)),
    toolRouting: aggregate(params.cases.map((c) => c.scores.toolRouting)),
    answerAssertions: aggregate(params.cases.map((c) => c.scores.answerAssertions)),
    storyCompleteness: aggregate(params.cases.map((c) => c.scores.storyCompleteness)),
    preferredSourceCompliance: aggregate(
      params.cases.map((c) => c.scores.preferredSourceCompliance),
    ),
    factualBoundaryCompliance: aggregate(
      params.cases.map((c) => c.scores.factualBoundaryCompliance),
    ),
  };

  const scoreVerdict = evaluateVerdict(
    {
      groundedness: aggregates.groundedness.mean,
      gapHonesty: aggregates.gapHonesty.mean,
      relevance: aggregates.relevance.mean,
      // Only fed into the verdict when at least one case actually asserted
      // routing this run — an unset/zero-count aggregate must never be
      // compared against the threshold as if it were a real 0 score (see
      // ./thresholds.ts's ScorerThresholds doc comment).
      ...(aggregates.toolRouting.count > 0 ? { toolRouting: aggregates.toolRouting.mean } : {}),
      // Same optional treatment for answer assertions (#300): only cases
      // that declare them contribute, so a run without any never fails on it.
      ...(aggregates.answerAssertions.count > 0
        ? { answerAssertions: aggregates.answerAssertions.mean }
        : {}),
      // Same optional treatment for story completeness (#295 correction,
      // finding 2): only cases the runner scores for it contribute.
      ...(aggregates.storyCompleteness.count > 0
        ? { storyCompleteness: aggregates.storyCompleteness.mean }
        : {}),
      // Same optional treatment for preferred-source compliance (#295
      // second independent-review correction, finding 4): only cases
      // declaring a `preferredRef` contribute, and — unlike the other
      // optional scorers — its committed threshold is blocking (1.0), so
      // a single failed preference case fails the run regardless of how
      // many others passed.
      ...(aggregates.preferredSourceCompliance.count > 0
        ? { preferredSourceCompliance: aggregates.preferredSourceCompliance.mean }
        : {}),
      // Same optional treatment for factual-boundary compliance (#295
      // third-independent-review correction, finding 1): only cases
      // declaring mustMatch/mustNotMatch/conditionalMustMatch contribute,
      // and — like preferredSourceCompliance — its committed threshold is
      // blocking (1.0): a single violated boundary in ANY case fails the
      // run, regardless of how many other assertions or cases passed.
      ...(aggregates.factualBoundaryCompliance.count > 0
        ? { factualBoundaryCompliance: aggregates.factualBoundaryCompliance.mean }
        : {}),
    },
    thresholds,
  );

  // A terminal case failure or an unexecuted case fails the run outright
  // (#307 C5) — never diluted by how well the cases that DID complete
  // scored, the same "one violation blocks the whole run" treatment
  // `preferredSourceCompliance`/`factualBoundaryCompliance` already get
  // above.
  const failures = [...scoreVerdict.failures];
  for (const failedCase of failedCases) {
    failures.push(
      `Case ${failedCase.id} failed terminally after ${failedCase.attempts.length} attempt(s): ` +
        `${failedCase.errorMessage}`,
    );
  }
  if (unexecutedCaseIds.length > 0) {
    failures.push(
      `${unexecutedCaseIds.length} case(s) did not run after a terminal failure: ` +
        unexecutedCaseIds.join(", "),
    );
  }
  // #307 second independent-review correction, finding 5: a budget overage
  // blocks the verdict outright, the same "one violation blocks the whole
  // run" treatment a terminal case failure already gets above.
  if (budgetExceeded) {
    failures.push(budgetExceeded.message);
  }

  return {
    promptVersion: params.promptVersion,
    modelId: params.modelId,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    cases: params.cases.map((c) => ({
      ...c,
      toolTrace: c.toolTrace ?? [],
      attempts: c.attempts ?? [],
    })),
    aggregates,
    totals: { cases: params.cases.length, ...params.totals },
    thresholds,
    verdict: {
      passed:
        scoreVerdict.passed &&
        failedCases.length === 0 &&
        unexecutedCaseIds.length === 0 &&
        budgetExceeded === null,
      failures,
    },
    failedCases,
    unexecutedCaseIds,
    complete: failedCases.length === 0 && unexecutedCaseIds.length === 0 && budgetExceeded === null,
    budgetExceeded,
  };
}
