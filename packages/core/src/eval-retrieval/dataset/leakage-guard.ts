/**
 * Fuzzy-query leakage guard (#295): a `fuzzy` golden query's complete
 * normalized wording must never appear verbatim inside any indexed chunk —
 * otherwise it stops being "recruiter wording with no literal overlap" and
 * starts being an `exact` case in disguise, silently inflating retrieval
 * scores rather than exercising semantic search.
 *
 * Normalization here is deliberately stricter than `../../chunking/text.ts`'s
 * `normalizeText` (which only unifies whitespace for chunk-splitting):
 * lowercase, strip punctuation, and collapse whitespace, so "REBUILD a
 * damaged, client relationship" and "rebuild a damaged client relationship."
 * compare equal.
 */

import type { GoldenQuery } from "./schema.js";

/** The minimal chunk shape this guard needs — a subset of `../../chunking/types.ts`'s `Chunk`. */
export interface LeakageGuardChunk {
  sourceType: string;
  sourceId: string;
  text: string;
}

/** One fuzzy query whose complete normalized wording leaked into an indexed chunk. */
export interface FuzzyQueryLeak {
  queryId: string;
  sourceType: string;
  sourceId: string;
}

export interface FuzzyQueryLeakageCheck {
  valid: boolean;
  leaks: FuzzyQueryLeak[];
}

/** Lowercase, strip all non-alphanumeric/whitespace characters, and collapse whitespace to single spaces. */
export function normalizeForLeakageCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks every `fuzzy`-category entry in `queries` against `chunks`: fails
 * when a query's complete normalized text is a substring of a chunk's
 * complete normalized text. Non-`fuzzy` categories are skipped — `exact`
 * cases are allowed, even expected, to reuse indexed wording.
 */
export function checkFuzzyQueryLeakage(
  queries: readonly GoldenQuery[],
  chunks: readonly LeakageGuardChunk[],
): FuzzyQueryLeakageCheck {
  const normalizedChunks = chunks.map((chunk) => ({
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    normalizedText: normalizeForLeakageCheck(chunk.text),
  }));

  const leaks: FuzzyQueryLeak[] = [];
  for (const query of queries) {
    if (query.category !== "fuzzy") continue;
    const normalizedQuery = normalizeForLeakageCheck(query.query);
    for (const chunk of normalizedChunks) {
      if (chunk.normalizedText.includes(normalizedQuery)) {
        leaks.push({ queryId: query.id, sourceType: chunk.sourceType, sourceId: chunk.sourceId });
      }
    }
  }

  return { valid: leaks.length === 0, leaks };
}
