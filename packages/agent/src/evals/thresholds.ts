/**
 * Threshold configuration for the eval suite (#72) — "Thresholds live in
 * config alongside the dataset so a change is visible in review." Committed
 * here, not computed, so a threshold change shows up as a diff in PR
 * review rather than being buried in a report artifact.
 *
 * These starting values are deliberately conservative placeholders set
 * BEFORE this suite's first real run against the live agent — see
 * `README.md`'s "Real-run results" section for the actual aggregates from
 * the first budget-capped real run and, if these numbers were adjusted
 * afterward to reflect honest current behavior (with a margin) rather than
 * to hide a discovered weakness, the rationale for that adjustment.
 */

export interface ScorerThresholds {
  groundedness: number;
  gapHonesty: number;
  relevance: number;
}

/**
 * Committed pass/fail thresholds per scorer aggregate, in `[0, 1]`.
 *
 * - `groundedness` 0.75 — most grounded-category answers should cite every
 *   factual sentence correctly; some slack for occasional under-citation on
 *   a genuinely free-tier, non-reasoning-tuned model.
 * - `gapHonesty` 0.7 — averaged across BOTH directions (honest gap
 *   admission and anti-over-refusal, `../scorers/gap-honesty.ts`); a lower
 *   bar than groundedness because this suite's heuristic scorer is
 *   pattern-based, not a judge model, so it tolerates more phrasing
 *   variance before it's confident the direction was scored correctly.
 * - `relevance` 0.6 — deliberately the lowest bar: it's a keyword-overlap
 *   heuristic (`../scorers/relevance.ts`), and this suite's own off-topic
 *   dataset cases are EXPECTED to score low on it (a correct redirect
 *   doesn't restate the off-topic question's own words) — the aggregate
 *   mixes cases that should score high with cases that should score low by
 *   design, so the bar has to sit below what a grounded-only average would
 *   support.
 */
export const EVAL_THRESHOLDS: ScorerThresholds = {
  groundedness: 0.75,
  gapHonesty: 0.7,
  relevance: 0.6,
};

const SCORER_LABELS: Readonly<Record<keyof ScorerThresholds, string>> = {
  groundedness: "groundedness",
  gapHonesty: "gap honesty",
  relevance: "relevance",
};

/** Verdict for one eval run: whether every scorer aggregate met its threshold, and a human-readable failure line per scorer that didn't. */
export interface Verdict {
  passed: boolean;
  failures: string[];
}

/** Compare `aggregates` against `thresholds` (defaults to the committed {@link EVAL_THRESHOLDS}) and produce a {@link Verdict}. */
export function evaluateVerdict(
  aggregates: ScorerThresholds,
  thresholds: ScorerThresholds = EVAL_THRESHOLDS,
): Verdict {
  const failures: string[] = [];
  for (const key of Object.keys(thresholds) as Array<keyof ScorerThresholds>) {
    const actual = aggregates[key];
    const minimum = thresholds[key];
    if (actual < minimum) {
      failures.push(
        `${SCORER_LABELS[key]} aggregate ${actual.toFixed(4)} is below its threshold ${minimum.toFixed(4)}`,
      );
    }
  }
  return { passed: failures.length === 0, failures };
}
