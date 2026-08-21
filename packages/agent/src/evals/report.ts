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
import type { ScoreResult } from "./scorers/types.js";
import type { ScorerThresholds, Verdict } from "./thresholds.js";
import { EVAL_THRESHOLDS, evaluateVerdict } from "./thresholds.js";

/** One case's scored result — `gapHonesty` is `null` for categories that don't probe either gap-honesty direction (off-topic, injection — see `./dataset/cases.ts`). */
export interface CaseReport {
  id: string;
  category: EvalCaseCategory;
  question: string;
  answer: string;
  scores: {
    groundedness: ScoreResult;
    gapHonesty: ScoreResult | null;
    relevance: ScoreResult;
  };
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
  };
  totals: EvalTotals & { cases: number };
  thresholds: ScorerThresholds;
  verdict: Verdict;
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
}): EvalReport {
  const thresholds = params.thresholds ?? EVAL_THRESHOLDS;
  const aggregates = {
    groundedness: aggregate(params.cases.map((c) => c.scores.groundedness)),
    gapHonesty: aggregate(params.cases.map((c) => c.scores.gapHonesty)),
    relevance: aggregate(params.cases.map((c) => c.scores.relevance)),
  };

  return {
    promptVersion: params.promptVersion,
    modelId: params.modelId,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    cases: params.cases,
    aggregates,
    totals: { cases: params.cases.length, ...params.totals },
    thresholds,
    verdict: evaluateVerdict(
      {
        groundedness: aggregates.groundedness.mean,
        gapHonesty: aggregates.gapHonesty.mean,
        relevance: aggregates.relevance.mean,
      },
      thresholds,
    ),
  };
}
