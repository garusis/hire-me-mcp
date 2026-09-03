/**
 * Threshold configuration for the eval suite (#72) — "Thresholds live in
 * config alongside the dataset so a change is visible in review." Committed
 * here, not computed, so a threshold change shows up as a diff in PR
 * review rather than being buried in a report artifact.
 *
 * RECALIBRATED for #143 against a real, full-dataset (17/17 cases) run made
 * AFTER that issue's three fixes landed — `gemini-3.5-flash-lite`,
 * `EVAL_RPM_LIMIT=10`, budget raised to cover the full dataset. Real
 * aggregates from that run: groundedness 0.8824, gapHonesty 1.0000,
 * relevance 0.5279 (111,137 total tokens, $0 — free tier). This supersedes
 * the #142 calibration (groundedness 0.7647, gapHonesty 1.0000, relevance
 * 0.5520) — see `README.md`'s "Real-run results" section for the full
 * per-case breakdown, the #143 diagnosis of what was actually broken at
 * each layer, and the residual, honestly-flagged limitations below.
 */

export interface ScorerThresholds {
  groundedness: number;
  gapHonesty: number;
  relevance: number;
  /**
   * Optional (#75, epic #6): unlike the three answer-content scorers above,
   * not every eval run exercises a case that declares
   * `EvalCase.expectedToolCall` (`./dataset/schema.ts`) — e.g. a
   * budget-capped local run sliced to the dataset's first few cases. When
   * `aggregates.toolRouting.count` is 0 for a run, `./report.ts` omits this
   * key from the aggregates object it hands to `evaluateVerdict`
   * specifically so a zero-count aggregate (mean defaults to 0) is never
   * compared against this threshold as if it were a real failing score.
   */
  toolRouting?: number;
  /**
   * Optional (#300): only cases that declare `EvalCase.answerAssertions`
   * contribute, so a run without any never fails on it — same treatment as
   * `toolRouting` above.
   */
  answerAssertions?: number;
  /**
   * Optional (#295 correction, finding 2): only cases that get scored by
   * `./scorers/story-completeness.ts` contribute — same zero-count-skips
   * treatment as `toolRouting`/`answerAssertions` above.
   */
  storyCompleteness?: number;
  /**
   * Optional (#295 second independent-review correction, finding 4): only
   * cases whose `answerAssertions.citationGroups` declares a `preferredRef`
   * contribute — same zero-count-skips treatment as the other optional
   * scorers above. UNLIKE those, this threshold is blocking (1.0, see
   * {@link EVAL_THRESHOLDS}'s doc comment) rather than a statistical target:
   * a declared preference is a locked per-case contract from the #295
   * manifest, not something a fraction of cases may fail.
   */
  preferredSourceCompliance?: number;
  /**
   * Optional (#295 third-independent-review correction, finding 1): only
   * cases that get scored by `./scorers/answer-assertions.ts`'s
   * `scoreFactualBoundaryCompliance` (i.e. declare `mustMatch`/
   * `mustNotMatch`/`conditionalMustMatch`) contribute — same zero-count-
   * skips treatment as the other optional scorers above. UNLIKE the
   * provisional-lenient scorers (`answerAssertions`, `storyCompleteness`),
   * this threshold is BLOCKING (1.0, see {@link EVAL_THRESHOLDS}'s doc
   * comment) for the identical reason `preferredSourceCompliance` is: a
   * factual boundary (no invented metrics, no LLM-accuracy framing, a
   * required positive caveat) is a locked per-case contract, not a
   * statistical target with acceptable slack — one violated case must fail
   * the run regardless of how many others pass.
   */
  factualBoundaryCompliance?: number;
}

/**
 * Committed pass/fail thresholds per scorer aggregate, in `[0, 1]`.
 *
 * - `groundedness` 0.75 (was 0.7) — honest aggregate was 0.8824 (15/17
 *   clean). **Two real fixes landed for #143, not one**: (1)
 *   `grounded-nodejs-experience`'s reported 0 was root-caused to
 *   `packages/core`'s `getSkillEvidence` never citing the skill entity
 *   itself for a `claimed` outcome — fixed there (self-citation, mirroring
 *   the `not-claimed` gap branch), confirmed 3/3 clean on repeat single-case
 *   runs; (2) a second, previously-undetected scorer bug made EVERY
 *   off-topic/injection case score 0 — `FACTUAL_INDICATOR_REGEX` matching
 *   generic domain nouns inside a correct redirect sentence, not an actual
 *   claim — fixed with a `redirectPolicy`-aware exclusion. **Flagged, not
 *   hidden**: that exclusion is itself a bounded phrase allowlist, not a
 *   structural fix — a follow-up full run during calibration still caught 2
 *   of 4 off-topic/injection cases on wording the first pattern set didn't
 *   anticipate (widened, unit-regression-tested against those exact
 *   transcripts, but NOT re-verified with a fresh live run before this
 *   calibration — the 0.8824 aggregate above predates that last widening
 *   commit). A future model paraphrase this allowlist doesn't cover remains
 *   a real, acknowledged risk; #73's category-aware scoring (using the
 *   dataset's own `category` field instead of free-text pattern matching)
 *   is the structural fix, flagged as follow-up, not silently deferred.
 * - `gapHonesty` 0.9 (was 0.85) — honest aggregate was a perfect 1.0000,
 *   now confirmed across TWO separate full-dataset runs (13/13 both times,
 *   both gap-honesty directions) rather than one — real margin to raise the
 *   bar and actually catch a regression, while still leaving room below the
 *   observed perfect score.
 * - `relevance` 0.48 (was 0.45) — honest aggregate was 0.5279. The #143
 *   relevance-scorer rewrite (stemming + an extended interview-specific
 *   stopword list, both via `packages/core`'s shared `tokenize`) measurably
 *   fixed the false-negative pattern #142 flagged — e.g.
 *   `grounded-typescript-house-numbers` and `grounded-nodejs-experience`
 *   now score a clean 1.0 (previously 0.6667). **Flagged, not smoothed
 *   over**: the AGGREGATE barely moved (0.5520 -> 0.5279, even slightly
 *   down) despite that real per-case improvement, because roughly a quarter
 *   of the dataset (the off-topic/injection categories) legitimately scores
 *   near-zero on this metric BY DESIGN — a correct redirect doesn't restate
 *   the off-topic question's own words — and that structural drag caps how
 *   high a whole-dataset average can go regardless of scorer quality. One
 *   `gap` case (`gap-golang`) also surfaced a residual false-negative this
 *   run: a correct, fully-grounded, terse honest-gap answer ("He hasn't
 *   done Go; the closest evidence is Node.js") scored 0/3 because its
 *   brevity never restates "production"/"experience"/"Golang" in full —
 *   the same class of over-strictness as before, just not eliminated
 *   entirely by this pass. The margin above (0.48, not pinned to 0.5279)
 *   accounts for this known residual risk rather than asserting it's fully
 *   resolved.
 */
export const EVAL_THRESHOLDS: ScorerThresholds = {
  groundedness: 0.75,
  gapHonesty: 0.9,
  relevance: 0.48,
  // toolRouting (#75, epic #6): NOT calibrated against a real run yet — this
  // package's own local `.env` GOOGLE_GENERATIVE_AI_API_KEY is a known-invalid
  // placeholder (see README.md), so no real tool-call trace has been observed
  // for the new RAG-grounded/exact-fact cases this task adds. 0.6 is a
  // deliberately conservative placeholder — not a real observed number,
  // flagged exactly as such per this file's own threshold-change policy — set
  // low enough that routing has real room to be imperfect (a model
  // occasionally reaching for search-career on a borderline exact question,
  // or vice versa) without gating merge on an unverified guess. Recalibrate
  // against `agent-evals`'s first real CI run of the extended dataset, the
  // same procedure `README.md`'s "Procedure when a threshold fails" section
  // documents for the other three scorers — raising this threshold with the
  // real aggregate is a follow-up, not silently deferred.
  toolRouting: 0.6,
  // answerAssertions (#300, #295): content boundaries — "this was a proof of
  // concept", "never 30% to 87%", "never transfer actions to a related
  // employer". Not calibrated against a real run yet (same local-key
  // limitation as toolRouting); 0.8 is a deliberately conservative
  // placeholder so a model occasionally paraphrasing around one boundary
  // does not gate merge on an unverified guess, while a systematic
  // regression (most asserted cases crossing a boundary) still fails.
  // Recalibrate from the first real `agent-evals` run of the story dataset.
  answerAssertions: 0.8,
  // storyCompleteness (#295 correction, finding 2): the 3-signal (situation/
  // action/result) heuristic in ./scorers/story-completeness.ts. Not
  // calibrated against a real run yet (same local-key limitation as
  // toolRouting/answerAssertions above); 0.7 is a deliberately conservative
  // placeholder — two of three signal classes must typically hold — so an
  // answer missing one signal class doesn't gate merge on an unverified
  // guess, while an adjective/testimonial-only answer (0/3 or 1/3) still
  // fails. Recalibrate from the first real agent-evals run of the story
  // dataset, same procedure as the other provisional thresholds above.
  storyCompleteness: 0.7,
  // preferredSourceCompliance (#295 second independent-review correction,
  // finding 4): BLOCKING, not provisional-lenient like the scorers above —
  // "For X01, citing story 002 while tools returned 001 and 002 scores
  // answerAssertions: 0.8; the committed threshold is also 0.8, so the
  // overall verdict passes... make any available-but-skipped preferred
  // source fail the eval." A single failed preferred-source case must fail
  // the run regardless of how many other cases (or other assertions in the
  // SAME case) pass — mirrors the retrieval package's own
  // `preferredSourceCompliance` fix, which raised that threshold from 0.7
  // to 1.0 for the identical reason: this is a locked per-case contract,
  // not a statistical target with acceptable slack.
  preferredSourceCompliance: 1,
  // factualBoundaryCompliance (#295 third-independent-review correction,
  // finding 1): BLOCKING like preferredSourceCompliance, for the same
  // reason — "Make factual-boundary compliance blocking per applicable
  // case." A run where any case's answer crosses a declared factual
  // boundary (an invented metric, an "LLM accuracy" framing, a missing
  // mandatory caveat) fails outright, never diluted by the case's other
  // passing assertions or averaged away across the rest of the suite.
  factualBoundaryCompliance: 1,
};

const SCORER_LABELS: Readonly<Record<keyof ScorerThresholds, string>> = {
  groundedness: "groundedness",
  gapHonesty: "gap honesty",
  relevance: "relevance",
  toolRouting: "tool routing",
  answerAssertions: "answer assertions",
  storyCompleteness: "story completeness",
  preferredSourceCompliance: "preferred-source compliance",
  factualBoundaryCompliance: "factual-boundary compliance",
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
    const minimum = thresholds[key];
    const actual = aggregates[key];
    // Both optional (toolRouting, #75) — an unset threshold imposes no
    // requirement, and an unset aggregate (no case exercised that scorer
    // this run) is skipped rather than compared as if it were a real 0.
    if (minimum === undefined || actual === undefined) continue;
    if (actual < minimum) {
      failures.push(
        `${SCORER_LABELS[key]} aggregate ${actual.toFixed(4)} is below its threshold ${minimum.toFixed(4)}`,
      );
    }
  }
  return { passed: failures.length === 0, failures };
}
