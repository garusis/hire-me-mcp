/**
 * The reusable, deterministic keyword/tag scoring engine at the center of
 * the search module. Knows nothing about projects, skills, career data, or
 * any other domain shape — it scores arbitrary {@link SearchDocument}s built
 * by a caller (`../search-projects.ts` today, #56's `getSkillEvidence`
 * next) against a caller-supplied, already-normalized/alias-resolved list of
 * query tokens.
 *
 * **Scoring rule (documented, not just implemented):** for every field on a
 * document, for every *distinct* query token present in that field's token
 * list, the field's weight is added to the document's score once — repeats
 * of the same token within a field do not multiply its contribution, so a
 * document cannot inflate its score by repeating a word. A document's total
 * score is the sum across every (field, matched token) pair. Documents with
 * a score of `0` (no field matched any query token) are excluded from the
 * results entirely, rather than returned with a `0` score.
 *
 * Field weights are the caller's decision (passed in per document, per
 * field) — this module enforces no particular weight scheme. The
 * `searchProjects` convention (exact tag > name > summary > body) lives in
 * `../search-projects.ts` and this package's README, not here.
 *
 * **Tie-breaker:** documents with an equal score are ordered by `id`
 * ascending (plain string comparison) — the same "stable id ordering"
 * convention `getExperience` uses for its own ties, so ranking is fully
 * deterministic regardless of the input document array's order.
 *
 * No embeddings, no randomness, no data-dependent floating point: scores are
 * an integer sum of caller-supplied weights, and the same input always
 * produces byte-identical output.
 */

/** One field of a {@link SearchDocument}: its name, its scoring weight, and its already-tokenized text. */
export interface SearchField {
  /** Machine-readable field name, echoed back in {@link MatchExplanation.field}. */
  name: string;
  /** Points added to the document's score for each distinct query token this field matches. */
  weight: number;
  /** This field's content, already normalized/tokenized by the caller (see `./normalize.js`). */
  tokens: string[];
}

/** A document the engine can score: a stable `id` plus the fields to match query tokens against. */
export interface SearchDocument {
  id: string;
  fields: SearchField[];
}

/** Which field, and which matched query token, contributed to a result's score. */
export interface MatchExplanation {
  field: string;
  token: string;
}

export interface SearchOptions {
  /**
   * Maximum number of results to return. Applied *after* ranking, as a
   * simple truncation — it never changes the relative order of the results
   * kept. Omitted (or `undefined`) returns every matching document.
   */
  limit?: number;
}

/** One document's outcome: its id, its total score, and the field/token pairs that produced it. */
export interface SearchMatch {
  id: string;
  score: number;
  matches: MatchExplanation[];
}

function scoreDocument(document: SearchDocument, queryTokens: string[]): SearchMatch {
  let score = 0;
  const matches: MatchExplanation[] = [];

  for (const field of document.fields) {
    const fieldTokens = new Set(field.tokens);
    for (const token of queryTokens) {
      if (fieldTokens.has(token)) {
        score += field.weight;
        matches.push({ field: field.name, token });
      }
    }
  }

  return { id: document.id, score, matches };
}

function compareMatches(a: SearchMatch, b: SearchMatch): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Scores every document in `documents` against `queryTokens` (an already
 * normalized/deduped-or-not list of tokens — the engine itself tolerates
 * duplicate tokens without double-counting, see {@link scoreDocument}),
 * keeps only the documents with a nonzero score, and returns them ranked
 * highest score first with ties broken by ascending `id`. Truncates to
 * `options.limit` after ranking, without disturbing relative order.
 *
 * Returns `[]` — never throws — for an empty `documents` array or an empty
 * `queryTokens` array (nothing to score against).
 */
export function search(
  documents: SearchDocument[],
  queryTokens: string[],
  options: SearchOptions = {},
): SearchMatch[] {
  if (documents.length === 0 || queryTokens.length === 0) {
    return [];
  }

  const uniqueQueryTokens = Array.from(new Set(queryTokens));
  const scored = documents
    .map((document) => scoreDocument(document, uniqueQueryTokens))
    .filter((match) => match.score > 0)
    .sort(compareMatches);

  return options.limit === undefined ? scored : scored.slice(0, options.limit);
}
