/**
 * Committed pass/fail thresholds for the retrieval eval suite (#41,
 * epic #6). Thresholds live in code, next to the dataset, so a change is a
 * visible diff in PR review rather than a number buried in a report
 * artifact — same pattern as `packages/agent/src/evals/thresholds.ts`.
 *
 * ## Threshold-change policy
 *
 * - **Raising** a threshold (making the bar stricter) may be done casually,
 *   in the same PR as the change that earned the improvement — it can only
 *   ever make the gate MORE protective.
 * - **Lowering** a threshold requires a written justification in the PR
 *   description: what real, honest run produced the number that no longer
 *   clears the old bar, and why that's an acceptable new floor rather than
 *   a symptom masked by moving the goalposts. Never lower a threshold
 *   silently in the same commit as an unrelated change.
 *
 * ## Initial calibration (#41)
 *
 * `searchCareer` and the golden dataset are new as of this issue, so there
 * is no prior real run to calibrate against — these are deliberately
 * CONSERVATIVE starting floors, not aspirational targets, chosen from the
 * dataset's own structure rather than a live run (the local
 * `GOOGLE_GENERATIVE_AI_API_KEY` is a known-invalid placeholder — see
 * `README.md`'s retrieval-eval section — so calibration against a real
 * embedding model happens on `.github/workflows/retrieval-eval.yml`'s
 * `workflow_dispatch` run against a disposable Neon branch, not locally):
 *
 * - `recallAtK` 0.5 (`topK` = 5 in `./runner.ts`) — over half the dataset's
 *   `exact`/`fuzzy` entries expect a single source id, which a working
 *   embedding model should place inside the top 5 results almost every
 *   time; the `cross-cutting` entries (expecting 3-5 sources each) are the
 *   ones expected to pull this average down, hence not a stricter floor.
 * - `precisionAtK` 0.2 — the corpus is small (~20 source records once
 *   chunked), so `topK=5` often returns close to the whole relevant
 *   neighborhood for a query rather than a large candidate pool to filter
 *   down from; most entries expect 1-2 sources out of up to 5 returned,
 *   which caps the achievable precision well below 1.0 by design, not by
 *   retrieval quality.
 * - `mrr` 0.4 — the first relevant result landing around rank 2-3 on
 *   average is a reasonable floor for a corpus this size without
 *   re-ranking (explicitly out of scope for #41/epic #6).
 * - `absentTopicAccuracy` 0.8 — every genuinely-absent-topic query should
 *   score below `ABSENT_TOPIC_MIN_SCORE` (see `./runner.ts`), but one
 *   borderline case out of 5 failing shouldn't fail the whole build while
 *   this is still uncalibrated against a real model.
 *
 * These are EXPECTED to move once a real `workflow_dispatch` run against a
 * populated Neon branch produces honest numbers (#41's "committed
 * thresholds are met by the current implementation at merge time"
 * acceptance criterion) — any adjustment follows the policy above.
 */

export interface RetrievalThresholds {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  absentTopicAccuracy: number;
}

// TEMPORARY — #52 acceptance-criteria demonstration ONLY: raises recallAtK
// to an impossible value so the required `retrieval-eval` check goes red
// on a real run, proving "a PR that degrades retrieval below the committed
// thresholds fails the required check and cannot be merged." Reverted in
// the very next commit — see that commit's message for the run link.
export const RETRIEVAL_THRESHOLDS: RetrievalThresholds = {
  recallAtK: 0.999,
  precisionAtK: 0.2,
  mrr: 0.4,
  absentTopicAccuracy: 0.8,
};

const THRESHOLD_LABELS: Readonly<Record<keyof RetrievalThresholds, string>> = {
  recallAtK: "recall@k",
  precisionAtK: "precision@k",
  mrr: "MRR",
  absentTopicAccuracy: "absent-topic accuracy",
};

/** Verdict for one retrieval eval run: whether every aggregate met its threshold, and a human-readable failure line per aggregate that didn't. */
export interface RetrievalVerdict {
  passed: boolean;
  failures: string[];
}

/** Compare `aggregates` against `thresholds` (defaults to the committed {@link RETRIEVAL_THRESHOLDS}) and produce a {@link RetrievalVerdict}. */
export function evaluateRetrievalVerdict(
  aggregates: RetrievalThresholds,
  thresholds: RetrievalThresholds = RETRIEVAL_THRESHOLDS,
): RetrievalVerdict {
  const failures: string[] = [];
  for (const key of Object.keys(thresholds) as Array<keyof RetrievalThresholds>) {
    const actual = aggregates[key];
    const minimum = thresholds[key];
    if (actual < minimum) {
      failures.push(
        `${THRESHOLD_LABELS[key]} aggregate ${actual.toFixed(4)} is below its threshold ${minimum.toFixed(4)}`,
      );
    }
  }
  return { passed: failures.length === 0, failures };
}
