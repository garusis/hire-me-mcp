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
  dedupeRankedSources,
  type ExpectedSource,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  type ScoredSource,
} from "./metrics.js";
import type { RetrievalCaseReport, RetrievalLane, RetrievalLaneResult } from "./report.js";
import { buildRetrievalReport, type RetrievalReport } from "./report.js";
import type { RetrievalThresholds } from "./thresholds.js";

/** The `sourceType` value identifying a story source (#307). */
const STORY_SOURCE_TYPE = "story";
/** `sourceTypes` the story-scoped lane restricts to (#307) — mirrors the production chat's story-scoped `search-career` call. */
const STORY_LANE_SOURCE_TYPES = [STORY_SOURCE_TYPE] as const;

/** The minimal `searchCareer`-shaped function the runner needs. */
export interface RetrievalSearcher {
  searchCareer: (
    query: string,
    options?: { topK?: number; minScore?: number; sourceTypes?: readonly string[] },
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

/**
 * Builds one lane's {@link RetrievalLaneResult}: its deduplicated ranked
 * ids (always populated, for observability), and — only when
 * `scoringExpectedSources` is non-null — that lane's own recall@k/
 * precision@k/MRR against exactly that expected-source set.
 * `scoringExpectedSources` is `null` to skip scoring entirely (metrics
 * stay `null`): the caller passes `null` for `absent-topic` cases (no
 * lane has expected sources to score against) and, per the Codex review
 * checkpoint correction (#307), for the `storyScoped` lane on any case
 * whose `expectedSources` contain no story — scoring that lane against a
 * story-less expected set would be a guaranteed 0 that depresses the
 * aggregate independently of retrieval quality, not a real signal.
 */
function buildLaneResult(
  lane: RetrievalLane,
  retrieved: readonly ScoredSource[],
  query: GoldenQuery,
  scoringExpectedSources: readonly ExpectedSource[] | null,
): RetrievalLaneResult {
  const retrievedIds = dedupeRankedSources(retrieved);
  if (scoringExpectedSources === null) {
    return { lane, retrievedIds, metrics: null };
  }
  const matchMode = query.matchMode ?? "all";
  return {
    lane,
    retrievedIds,
    metrics: {
      recallAtK: recallAtK(retrieved, scoringExpectedSources, matchMode),
      precisionAtK: precisionAtK(retrieved, scoringExpectedSources),
      reciprocalRank: reciprocalRank(retrieved, scoringExpectedSources),
    },
  };
}

function baseCaseReport(
  query: GoldenQuery,
  retrieved: RetrievalCaseReport["retrieved"],
  lanes: Record<RetrievalLane, RetrievalLaneResult>,
  scoringLane: RetrievalLane,
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
    scoringLane,
    lanes,
  };
}

/**
 * A case whose `expectedSources` are exclusively story sources routes its
 * top-level metrics/pass-fail/preferred-source check from the `storyScoped`
 * lane instead of `unscoped` (#307 owner-authorized implementation
 * direction, following the real-run diagnosis that recommendations and
 * other source types crowd stories out of the unscoped top-5 — the
 * production chat's own story-scoped search path is what these cases
 * actually exercise). A mixed or non-story case is unaffected and stays on
 * `unscoped`, exactly as before.
 */
export function isStoryOnlyCase(query: GoldenQuery): boolean {
  return (
    query.expectedSources.length > 0 &&
    query.expectedSources.every((source) => source.sourceType === STORY_SOURCE_TYPE)
  );
}

/**
 * Picks which lane's raw retrieved list a story-only case's top-level
 * metrics/pass-fail/preferred-source check is computed against (#307):
 * `storyScoped` for a case whose `expectedSources` are exclusively story
 * sources, `unscoped` for everything else. Always returns a fresh, mutable
 * array — never an alias of either readonly input — so the result can
 * safely be assigned to `RetrievalCaseReport.retrieved` regardless of how
 * the caller's own arrays are typed.
 */
export function selectScoringRetrieved(
  query: GoldenQuery,
  retrieved: readonly ScoredSource[],
  storyScopedRetrieved: readonly ScoredSource[],
): ScoredSource[] {
  return isStoryOnlyCase(query) ? [...storyScopedRetrieved] : [...retrieved];
}

function scoreExpectedCase(
  query: GoldenQuery,
  retrieved: RetrievalCaseReport["retrieved"],
  storyScopedRetrieved: readonly ScoredSource[],
  lanes: Record<RetrievalLane, RetrievalLaneResult>,
): RetrievalCaseReport {
  const scoringRetrieved = selectScoringRetrieved(query, retrieved, storyScopedRetrieved);
  const matchMode = query.matchMode ?? "all";
  const metrics = {
    recallAtK: recallAtK(scoringRetrieved, query.expectedSources, matchMode),
    precisionAtK: precisionAtK(scoringRetrieved, query.expectedSources),
    reciprocalRank: reciprocalRank(scoringRetrieved, query.expectedSources),
  };
  const matchModePassed = metrics.recallAtK === 1;

  const preferenceCheck =
    query.preferredSource === undefined
      ? null
      : checkPreferredSource(scoringRetrieved, query.expectedSources, query.preferredSource);

  const scoringLane: RetrievalLane = isStoryOnlyCase(query) ? "storyScoped" : "unscoped";

  return {
    ...baseCaseReport(query, scoringRetrieved, lanes, scoringLane),
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
  lanes: Record<RetrievalLane, RetrievalLaneResult>,
): RetrievalCaseReport {
  const check = checkExpectEmpty(retrieved, absentTopicMinScore);
  return {
    ...baseCaseReport(query, retrieved, lanes, "unscoped"),
    expectEmptyCheck: check,
    matchModePassed: true,
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
    const [unscopedResult, storyScopedResult] = await Promise.all([
      deps.searchCareer(query.query, { topK: config.topK }),
      deps.searchCareer(query.query, { topK: config.topK, sourceTypes: STORY_LANE_SOURCE_TYPES }),
    ]);
    const retrieved = unscopedResult.results.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      score: item.score,
    }));
    const storyScopedRetrieved = storyScopedResult.results.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      score: item.score,
    }));

    const isAbsentTopic = query.category === "absent-topic";
    const storyExpectedSources = query.expectedSources.filter(
      (source) => source.sourceType === STORY_SOURCE_TYPE,
    );

    const lanes: Record<RetrievalLane, RetrievalLaneResult> = {
      unscoped: buildLaneResult(
        "unscoped",
        retrieved,
        query,
        isAbsentTopic ? null : query.expectedSources,
      ),
      storyScoped: buildLaneResult(
        "storyScoped",
        storyScopedRetrieved,
        query,
        isAbsentTopic || storyExpectedSources.length === 0 ? null : storyExpectedSources,
      ),
    };

    cases.push(
      query.category === "absent-topic"
        ? scoreAbsentTopicCase(query, retrieved, config.absentTopicMinScore, lanes)
        : scoreExpectedCase(query, retrieved, storyScopedRetrieved, lanes),
    );
  }

  return buildRetrievalReport({
    cases,
    topK: config.topK,
    absentTopicMinScore: config.absentTopicMinScore,
    thresholds: config.thresholds,
  });
}
