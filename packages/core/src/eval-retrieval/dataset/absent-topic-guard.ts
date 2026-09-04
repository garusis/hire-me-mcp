/**
 * Absent-topic corpus-drift guard (#307): an `absent-topic` golden query's
 * whole premise is that its distinguishing terms are genuinely missing from
 * the indexed corpus. Content authored later can silently invalidate that
 * premise (#307's real-run diagnosis: `absent-sap-erp` went stale the day a
 * story mentioning "legacy SAP system" was added). This guard fails loudly
 * the moment any `distinguishingTerms` entry (see `./schema.ts`) appears
 * anywhere in the rendered corpus, instead of leaving a negative control
 * that quietly stops measuring anything.
 */

import type { GoldenQuery } from "./schema.js";

/** The minimal chunk shape this guard needs — a subset of `../../chunking/types.ts`'s `Chunk`. */
export interface AbsentTopicGuardChunk {
  sourceType: string;
  sourceId: string;
  text: string;
}

/** One `distinguishingTerms` entry found to have leaked into the corpus. */
export interface AbsentTopicDriftViolation {
  queryId: string;
  sourceType: string;
  sourceId: string;
  term: string;
}

export interface AbsentTopicDriftCheck {
  valid: boolean;
  violations: AbsentTopicDriftViolation[];
}

/** Lowercase, strip all non-alphanumeric/whitespace characters, and collapse whitespace to single spaces. */
export function normalizeForDriftCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks every `absent-topic`-category entry's `distinguishingTerms` against
 * `chunks`: fails when a term is a substring of a chunk's normalized text.
 * Categories without `distinguishingTerms` (everything but `absent-topic`,
 * per `./schema.ts`) are skipped — they have nothing to check.
 */
export function checkAbsentTopicDrift(
  queries: readonly GoldenQuery[],
  chunks: readonly AbsentTopicGuardChunk[],
): AbsentTopicDriftCheck {
  const normalizedChunks = chunks.map((chunk) => ({
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    normalizedText: normalizeForDriftCheck(chunk.text),
  }));

  const violations: AbsentTopicDriftViolation[] = [];
  for (const query of queries) {
    const terms = query.distinguishingTerms ?? [];
    for (const term of terms) {
      const normalizedTerm = normalizeForDriftCheck(term);
      for (const chunk of normalizedChunks) {
        if (chunk.normalizedText.includes(normalizedTerm)) {
          violations.push({
            queryId: query.id,
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId,
            term,
          });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}
