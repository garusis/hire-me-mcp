/**
 * Machine-readable retrieval eval report (#41, epic #6): per-query results
 * plus aggregate recall@k/precision@k/MRR/absent-topic-accuracy and the
 * pass/fail verdict against the committed thresholds. `buildRetrievalReport`
 * is pure — `./runner.ts` does the real `searchCareer` calls and per-case
 * scoring, then hands the collected `RetrievalCaseReport[]` here to
 * assemble the final, JSON-serializable report. Pure means this module's
 * own tests need zero database/network calls, on injected fixture case
 * results — the same seam `packages/agent/src/evals/report.ts` uses.
 */

import type { ExpectEmptyCheck, ExpectedSource, ScoredSource } from "./metrics.js";
import type { RetrievalThresholds, RetrievalVerdict } from "./thresholds.js";
import { evaluateRetrievalVerdict, RETRIEVAL_THRESHOLDS } from "./thresholds.js";

/** One golden query's computed recall@k/precision@k/MRR — `null` for `absent-topic` cases, which are scored by {@link ExpectEmptyCheck} instead. */
export interface RetrievalCaseMetrics {
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
}

/** One golden query's full result: what was retrieved, how it scored, and whether it passed. */
export interface RetrievalCaseReport {
  id: string;
  category: string;
  query: string;
  expectedSources: ExpectedSource[];
  retrieved: ScoredSource[];
  metrics: RetrievalCaseMetrics | null;
  expectEmptyCheck: ExpectEmptyCheck | null;
  passed: boolean;
}

/** Aggregate metrics computed over the full case set. */
export interface RetrievalAggregates {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  absentTopicAccuracy: number;
}

/** The full machine-readable retrieval eval report. */
export interface RetrievalReport {
  generatedAt: string;
  topK: number;
  absentTopicMinScore: number;
  cases: RetrievalCaseReport[];
  aggregates: RetrievalAggregates;
  thresholds: RetrievalThresholds;
  verdict: RetrievalVerdict;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeAggregates(cases: readonly RetrievalCaseReport[]): RetrievalAggregates {
  const scored = cases.filter((c) => c.metrics !== null);
  const absentTopic = cases.filter((c) => c.category === "absent-topic");

  return {
    recallAtK: mean(scored.map((c) => c.metrics?.recallAtK ?? 0)),
    precisionAtK: mean(scored.map((c) => c.metrics?.precisionAtK ?? 0)),
    mrr: mean(scored.map((c) => c.metrics?.reciprocalRank ?? 0)),
    absentTopicAccuracy:
      absentTopic.length === 0
        ? 1
        : absentTopic.filter((c) => c.passed).length / absentTopic.length,
  };
}

/** Assemble the final {@link RetrievalReport} from collected per-case results. Pure — no I/O. */
export function buildRetrievalReport(params: {
  cases: RetrievalCaseReport[];
  topK: number;
  absentTopicMinScore: number;
  thresholds?: RetrievalThresholds;
  generatedAt?: string;
}): RetrievalReport {
  const thresholds = params.thresholds ?? RETRIEVAL_THRESHOLDS;
  const aggregates = computeAggregates(params.cases);

  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    topK: params.topK,
    absentTopicMinScore: params.absentTopicMinScore,
    cases: params.cases,
    aggregates,
    thresholds,
    verdict: evaluateRetrievalVerdict(aggregates, thresholds),
  };
}
