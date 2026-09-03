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

import type { ExpectEmptyCheck, ExpectedSource, MatchMode, ScoredSource } from "./metrics.js";
import type { RetrievalThresholds, RetrievalVerdict } from "./thresholds.js";
import { evaluateRetrievalVerdict, RETRIEVAL_THRESHOLDS } from "./thresholds.js";

/** One golden query's computed recall@k/precision@k/MRR — `null` for `absent-topic` cases, which are scored by {@link ExpectEmptyCheck} instead. */
export interface RetrievalCaseMetrics {
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
}

/**
 * The two retrieval "lanes" a golden query is run against (#307, diagnosing
 * the story-retrieval false negatives from #296's real eval): `"unscoped"`
 * is the plain `searchCareer` call every case has always used (no
 * `sourceTypes` filter — this is what the top-level `metrics`/aggregates
 * above measure, unchanged); `"storyScoped"` re-runs the same query with
 * `sourceTypes: ["story"]`, mirroring the production chat's story-scoped
 * search path so this eval can catch a retrieval gap in that specific lane
 * rather than only the unscoped average.
 */
export type RetrievalLane = "unscoped" | "storyScoped";

/**
 * One lane's result for one golden query: which lane, the deduplicated
 * ranked `"sourceType:sourceId"` ids that lane actually returned (compact —
 * no scores or chunk text, just enough to see what was retrieved and in
 * what order), and that lane's own recall@k/precision@k/MRR — `null` for
 * `absent-topic` cases, same convention as {@link RetrievalCaseMetrics}.
 */
export interface RetrievalLaneResult {
  lane: RetrievalLane;
  retrievedIds: string[];
  metrics: RetrievalCaseMetrics | null;
}

/**
 * One golden query's full result: what was retrieved, how it scored, and
 * whether it passed. `preferencePassed`/`preferredSourceReciprocalRank` are
 * `null` when the case declares no `preferredSource` (#295) — a distinct
 * value from `false`, so "no preference declared" is never confused with
 * "preference declared and failed" in the per-case report.
 */
export interface RetrievalCaseReport {
  id: string;
  category: string;
  query: string;
  expectedSources: ExpectedSource[];
  retrieved: ScoredSource[];
  metrics: RetrievalCaseMetrics | null;
  expectEmptyCheck: ExpectEmptyCheck | null;
  matchMode: MatchMode;
  preferredSource: ExpectedSource | null;
  /** Whether this case's `matchMode` check passed (recall === 1 for "all", any-hit for "any"); `true` (vacuous) for `absent-topic` cases, which use `expectEmptyCheck` instead. */
  matchModePassed: boolean;
  /** `null` when no `preferredSource` is declared; otherwise whether the preference check (`checkPreferredSource`) passed. */
  preferencePassed: boolean | null;
  /** `null` when no `preferredSource` is declared; otherwise the preferred source's own reciprocal rank. */
  preferredSourceReciprocalRank: number | null;
  /** The combined pass/fail: `matchModePassed` (or `expectEmptyCheck.passed` for absent-topic) AND `preferencePassed` when declared. */
  passed: boolean;
  /** This case's result in each retrieval lane (#307) — `unscoped` mirrors the fields above; `storyScoped` is the same query re-run with `sourceTypes: ["story"]`. */
  lanes: Record<RetrievalLane, RetrievalLaneResult>;
}

/** One lane's aggregate recall@k/precision@k/MRR, computed the same way as the top-level aggregates but restricted to that lane's cases (#307). */
export interface RetrievalLaneAggregates {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
}

/** Aggregate metrics computed over the full case set. */
export interface RetrievalAggregates {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  absentTopicAccuracy: number;
  /** Fraction of preference-declaring cases whose preference passed — `1` (vacuous) when no case declares a `preferredSource`. */
  preferredSourceCompliance: number;
  /** Per-lane recall@k/precision@k/MRR (#307) — `unscoped` duplicates the top-level fields above; `storyScoped` is the new diagnostic. */
  lanes: Record<RetrievalLane, RetrievalLaneAggregates>;
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

function computeLaneAggregates(
  cases: readonly RetrievalCaseReport[],
  lane: RetrievalLane,
): RetrievalLaneAggregates {
  const scored = cases.filter((c) => c.lanes[lane].metrics !== null);
  return {
    recallAtK: mean(scored.map((c) => c.lanes[lane].metrics?.recallAtK ?? 0)),
    precisionAtK: mean(scored.map((c) => c.lanes[lane].metrics?.precisionAtK ?? 0)),
    mrr: mean(scored.map((c) => c.lanes[lane].metrics?.reciprocalRank ?? 0)),
  };
}

function computeAggregates(cases: readonly RetrievalCaseReport[]): RetrievalAggregates {
  const scored = cases.filter((c) => c.metrics !== null);
  const absentTopic = cases.filter((c) => c.category === "absent-topic");
  const preferenceDeclaring = cases.filter((c) => c.preferencePassed !== null);

  return {
    recallAtK: mean(scored.map((c) => c.metrics?.recallAtK ?? 0)),
    precisionAtK: mean(scored.map((c) => c.metrics?.precisionAtK ?? 0)),
    mrr: mean(scored.map((c) => c.metrics?.reciprocalRank ?? 0)),
    absentTopicAccuracy:
      absentTopic.length === 0
        ? 1
        : absentTopic.filter((c) => c.passed).length / absentTopic.length,
    preferredSourceCompliance:
      preferenceDeclaring.length === 0
        ? 1
        : preferenceDeclaring.filter((c) => c.preferencePassed === true).length /
          preferenceDeclaring.length,
    lanes: {
      unscoped: computeLaneAggregates(cases, "unscoped"),
      storyScoped: computeLaneAggregates(cases, "storyScoped"),
    },
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
