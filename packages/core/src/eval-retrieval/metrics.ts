/**
 * Retrieval eval metrics (#41, epic #6) — recall@k, precision@k, mean
 * reciprocal rank, and the absent-topic "nothing above minScore" check.
 * Pure functions, no I/O: `packages/core/src/eval-retrieval/runner.ts` maps
 * a `searchCareer` result's ranked `SearchCareerResultItem[]` into the
 * `ScoredSource[]` shape below and calls these; `metrics.test.ts` is the
 * hand-computed-fixture suite the issue's acceptance criteria require so a
 * broken metric can't silently pass the rest of the suite.
 *
 * Every metric here operates on SOURCE ids (`sourceType` + `sourceId`), not
 * chunk ids — the golden dataset's `expectedSources` are source-id pointers
 * (issue #41's "expected sources are referenced by stable source ids, not
 * chunk id" decision), and a single source can legitimately appear as
 * multiple ranked chunks in one `searchCareer` result. {@link dedupeRankedSources}
 * collapses that down to one ranked list of unique sources (first-seen rank
 * wins) before recall/precision/MRR are computed, so a source hitting
 * multiple chunks never inflates its own metrics.
 */

/** The minimal shape these metrics need from one retrieved chunk. */
export interface ScoredSource {
  sourceType: string;
  sourceId: string;
  score: number;
}

/** One golden dataset entry's expected source pointer. */
export interface ExpectedSource {
  sourceType: string;
  sourceId: string;
}

function sourceKey(source: ExpectedSource): string {
  return `${source.sourceType}:${source.sourceId}`;
}

/**
 * Collapses a ranked, possibly-duplicated (by source) list of retrieved
 * chunks into a ranked list of unique `"sourceType:sourceId"` keys — the
 * first rank each source appears at wins; later duplicates are dropped
 * without shifting anything already collected.
 */
export function dedupeRankedSources(retrieved: readonly ScoredSource[]): string[] {
  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const item of retrieved) {
    const key = sourceKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      ranked.push(key);
    }
  }
  return ranked;
}

/** `"all"` (default): fraction of required sources retrieved. `"any"`: `1` when at least one acceptable source is retrieved, `0` otherwise (#295). */
export type MatchMode = "all" | "any";

/**
 * Fraction of `expected` sources present anywhere in the deduplicated
 * `retrieved` list under `matchMode: "all"` (the default — see #295's
 * multiple-valid-answer semantics for `"any"`). An empty `expected` set is
 * vacuously satisfied (`1`), regardless of what was retrieved — recall has
 * nothing to measure when nothing was expected; that case is what
 * {@link checkExpectEmpty} exists to check instead, on the absent-topic
 * dataset category.
 */
export function recallAtK(
  retrieved: readonly ScoredSource[],
  expected: readonly ExpectedSource[],
  matchMode: MatchMode = "all",
): number {
  if (expected.length === 0) return 1;
  const retrievedKeys = new Set(dedupeRankedSources(retrieved));
  const expectedKeys = new Set(expected.map(sourceKey));

  if (matchMode === "any") {
    for (const key of expectedKeys) {
      if (retrievedKeys.has(key)) return 1;
    }
    return 0;
  }

  let hits = 0;
  for (const key of expectedKeys) {
    if (retrievedKeys.has(key)) hits++;
  }
  return hits / expectedKeys.size;
}

/**
 * Fraction of the deduplicated `retrieved` sources that are in `expected`.
 * `0` when nothing was retrieved (an empty denominator has nothing to be
 * "precise" about, so this reports the same "no signal" result recall's
 * empty-retrieval case does, rather than an undefined `NaN`).
 */
export function precisionAtK(
  retrieved: readonly ScoredSource[],
  expected: readonly ExpectedSource[],
): number {
  const rankedRetrieved = dedupeRankedSources(retrieved);
  if (rankedRetrieved.length === 0) return 0;
  const expectedKeys = new Set(expected.map(sourceKey));
  const hits = rankedRetrieved.filter((key) => expectedKeys.has(key)).length;
  return hits / rankedRetrieved.length;
}

/**
 * `1 / rank` of the first deduplicated retrieved source that's in
 * `expected` (1-indexed rank), or `0` if none of `expected` appears at all.
 */
export function reciprocalRank(
  retrieved: readonly ScoredSource[],
  expected: readonly ExpectedSource[],
): number {
  const expectedKeys = new Set(expected.map(sourceKey));
  const rankedRetrieved = dedupeRankedSources(retrieved);
  for (const [index, key] of rankedRetrieved.entries()) {
    if (expectedKeys.has(key)) {
      return 1 / (index + 1);
    }
  }
  return 0;
}

/** Result of checking a golden query's `preferredSource` compliance (#295). */
export interface PreferredSourceCheck {
  /** `true` only when the preferred source was retrieved AND no other acceptable (`expected`) source outranks it. */
  passed: boolean;
  preferredRetrieved: boolean;
  /** The preferred source's own reciprocal rank in the deduplicated ranked list (`0` if not retrieved). */
  reciprocalRank: number;
  /** Acceptable alternatives (other `expected` sources) that ranked above the preferred source — the preference-failure evidence. */
  outrankedBy: ExpectedSource[];
}

/**
 * The preferred-source compliance check (#295, audit #305 point 8): passes
 * only when `preferredSource` is retrieved AND ranks above every OTHER
 * acceptable source in `expected`'s deduplicated ranked list. An unexpected,
 * non-acceptable source outranking it does not break the preference — only
 * another entry from `expected` does.
 */
export function checkPreferredSource(
  retrieved: readonly ScoredSource[],
  expected: readonly ExpectedSource[],
  preferredSource: ExpectedSource,
): PreferredSourceCheck {
  const ranked = dedupeRankedSources(retrieved);
  const preferredKey = sourceKey(preferredSource);
  const preferredIndex = ranked.indexOf(preferredKey);
  const preferredRetrieved = preferredIndex !== -1;

  const alternativeKeyToSource = new Map<string, ExpectedSource>();
  for (const source of expected) {
    const key = sourceKey(source);
    if (key !== preferredKey) alternativeKeyToSource.set(key, source);
  }

  const outrankedBy: ExpectedSource[] = [];
  if (preferredRetrieved) {
    for (let index = 0; index < preferredIndex; index++) {
      const alternative = alternativeKeyToSource.get(ranked[index] as string);
      if (alternative !== undefined) outrankedBy.push(alternative);
    }
  }

  return {
    passed: preferredRetrieved && outrankedBy.length === 0,
    preferredRetrieved,
    reciprocalRank: preferredRetrieved ? 1 / (preferredIndex + 1) : 0,
    outrankedBy,
  };
}

/** Result of checking an absent-topic (`expectEmpty: true`) golden query. */
export interface ExpectEmptyCheck {
  passed: boolean;
  /** Every result that violated the check (scored `>= minScore`), for the per-query failure report. */
  aboveThreshold: ScoredSource[];
}

/**
 * The absent-topic check (#41's acceptance criterion: "Absent-topic queries
 * pass only when nothing is returned above minScore"): passes only when
 * every retrieved result scores strictly below `minScore` — a result at
 * exactly `minScore` still violates it, matching `searchCareer`'s own `>=`
 * inclusion semantics (`minScore` is a floor a result must clear).
 */
export function checkExpectEmpty(
  results: readonly ScoredSource[],
  minScore: number,
): ExpectEmptyCheck {
  const aboveThreshold = results.filter((result) => result.score >= minScore);
  return { passed: aboveThreshold.length === 0, aboveThreshold };
}
