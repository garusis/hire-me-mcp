/**
 * Retrieval eval runner (#41, epic #6): executes every golden dataset query
 * against `searchCareer` (#34), scores each with the metrics in
 * `./metrics.ts`, and assembles the final report (`./report.ts`).
 *
 * ## Dependency injection — the zero-network test seam
 *
 * `runRetrievalEval`'s second argument, `RunnerDeps`, is where the real
 * `searchCareer` call lives (`./cli.ts` is the only place that wires the
 * real, DB-and-embedder-backed function). `runner.test.ts` injects a fake
 * instead, so this module's own tests make zero database/network calls
 * while still exercising the real per-query scoring and aggregation logic —
 * same pattern as `packages/agent/src/evals/runner.ts`.
 *
 * ## Per-query scoring
 *
 * Every query (regardless of category) is run once with `options.topK` and
 * no `minScore` filter, so the runner sees the full ranked list and can
 * apply its own category-specific check on top of it rather than relying on
 * `searchCareer`'s own filtering:
 *
 * - `exact`/`fuzzy`/`cross-cutting` — scored with `recallAtK`/`precisionAtK`/
 *   `reciprocalRank` (`./metrics.ts`) against `expectedSources`. A case
 *   "passes" when every expected source was retrieved (`recallAtK === 1`).
 * - `absent-topic` — scored with `checkExpectEmpty` (`./metrics.ts`)
 *   against `options.absentTopicMinScore`, matching #41's acceptance
 *   criterion that these "pass only when nothing is returned above
 *   minScore".
 */

import type { GoldenQuery } from "./dataset/schema.js";
import {
  checkExpectEmpty,
  checkPreferredSource,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "./metrics.js";
import type { RetrievalCaseReport } from "./report.js";
import { buildRetrievalReport, type RetrievalReport } from "./report.js";
import type { RetrievalThresholds } from "./thresholds.js";

/** The minimal `searchCareer`-shaped function the runner needs. */
export interface RetrievalSearcher {
  searchCareer: (
    query: string,
    options?: { topK?: number; minScore?: number },
  ) => Promise<{
    results: Array<{ sourceType: string; sourceId: string; score: number }>;
  }>;
}

export interface RunRetrievalEvalConfig {
  queries: readonly GoldenQuery[];
  /** Results requested per query — also the `k` in recall@k/precision@k. */
  topK: number;
  /** A result at or above this score fails an `absent-topic` query (#41's "nothing above minScore" acceptance criterion). */
  absentTopicMinScore: number;
  thresholds?: RetrievalThresholds;
}

function baseCaseReport(
  query: GoldenQuery,
  retrieved: RetrievalCaseReport["retrieved"],
): RetrievalCaseReport {
  return {
    id: query.id,
    category: query.category,
    query: query.query,
    expectedSources: query.expectedSources,
    retrieved,
    metrics: null,
    expectEmptyCheck: null,
    matchMode: query.matchMode ?? "all",
    preferredSource: query.preferredSource ?? null,
    matchModePassed: false,
    preferencePassed: null,
    preferredSourceReciprocalRank: null,
    passed: false,
  };
}

function scoreExpectedCase(
  query: GoldenQuery,
  retrieved: RetrievalCaseReport["retrieved"],
): RetrievalCaseReport {
  const matchMode = query.matchMode ?? "all";
  const metrics = {
    recallAtK: recallAtK(retrieved, query.expectedSources, matchMode),
    precisionAtK: precisionAtK(retrieved, query.expectedSources),
    reciprocalRank: reciprocalRank(retrieved, query.expectedSources),
  };
  const matchModePassed = metrics.recallAtK === 1;

  const preferenceCheck =
    query.preferredSource === undefined
      ? null
      : checkPreferredSource(retrieved, query.expectedSources, query.preferredSource);

  return {
    ...baseCaseReport(query, retrieved),
    metrics,
    matchModePassed,
    preferencePassed: preferenceCheck?.passed ?? null,
    preferredSourceReciprocalRank: preferenceCheck?.reciprocalRank ?? null,
    passed: matchModePassed && (preferenceCheck === null || preferenceCheck.passed),
  };
}

function scoreAbsentTopicCase(
  query: GoldenQuery,
  retrieved: RetrievalCaseReport["retrieved"],
  absentTopicMinScore: number,
): RetrievalCaseReport {
  const check = checkExpectEmpty(retrieved, absentTopicMinScore);
  return {
    ...baseCaseReport(query, retrieved),
    expectEmptyCheck: check,
    passed: check.passed,
  };
}

/** Run the retrieval eval: execute every `config.queries` entry against `deps.searchCareer`, score each, and assemble the final report. */
export async function runRetrievalEval(
  config: RunRetrievalEvalConfig,
  deps: RetrievalSearcher,
): Promise<RetrievalReport> {
  const cases: RetrievalCaseReport[] = [];

  for (const query of config.queries) {
    const result = await deps.searchCareer(query.query, { topK: config.topK });
    const retrieved = result.results.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      score: item.score,
    }));

    cases.push(
      query.category === "absent-topic"
        ? scoreAbsentTopicCase(query, retrieved, config.absentTopicMinScore)
        : scoreExpectedCase(query, retrieved),
    );
  }

  return buildRetrievalReport({
    cases,
    topK: config.topK,
    absentTopicMinScore: config.absentTopicMinScore,
    thresholds: config.thresholds,
  });
}
