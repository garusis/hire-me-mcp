/**
 * Query/document normalization shared by every reusable piece of the search
 * module (`./alias-resolver.ts`, `./engine.ts`) and by any future consumer —
 * `searchProjects` (#55) today, `getSkillEvidence` (#56) next. Deliberately
 * has no knowledge of projects, skills, or any other domain shape: it only
 * knows how to turn free text into a deterministic, comparable token form.
 *
 * Normalization pipeline (both {@link tokenize} and {@link normalizeTerm}):
 *
 * 1. Unicode NFKD-decompose, then strip combining diacritical marks — so
 *    accented Latin letters (Spanish "café", "diseño") fold to their
 *    unaccented base letter ("cafe", "diseno") instead of being treated as a
 *    distinct character from the unaccented spelling.
 * 2. Lowercase and trim.
 * 3. Split on runs of whitespace into words.
 * 4. Strip every character from each word that is not `[a-z0-9-]` — this
 *    removes surrounding *and* internal punctuation (`"Node.js!"` ->
 *    `"nodejs"`, `"(React),"` -> `"react"`) while deliberately preserving
 *    internal hyphens, so a kebab-case controlled-vocabulary tag like
 *    `"openai-api"` or `"ai-agents"` survives as a single token instead of
 *    being split into two.
 * 5. Drop empty results and English stopwords (see {@link STOPWORDS}).
 */

/**
 * A small, deliberately conservative stopword list: common English function
 * words that carry no search signal on their own and would otherwise show up
 * as spurious token matches against short field/tag text. Not exhaustive —
 * grow it only when a real query demonstrates a false-positive match, not
 * speculatively.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "for",
  "in",
  "is",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
]);

const DIACRITIC_MARKS = /\p{Diacritic}/gu;
const NON_TOKEN_CHARS = /[^a-z0-9-]+/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(DIACRITIC_MARKS, "");
}

function cleanWord(word: string): string {
  return word.replace(NON_TOKEN_CHARS, "").replace(LEADING_TRAILING_HYPHENS, "");
}

/**
 * Splits free text into normalized, deterministic tokens: case-folded,
 * diacritic-stripped, punctuation-stripped (internal hyphens preserved),
 * stopwords removed. Word order is preserved and duplicates are **not**
 * deduped — callers that need a unique token set do that themselves. Returns
 * `[]` for empty, whitespace-only, or punctuation-only input; never throws.
 */
export function tokenize(value: string): string[] {
  const normalized = stripDiacritics(value).toLowerCase().trim();
  if (normalized.length === 0) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .map(cleanWord)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Normalizes an arbitrary term (a canonical name or an alias, single- or
 * multi-word) into a deterministic, space-joined token sequence, so two
 * differently-cased/punctuated/accented spellings of the same term compare
 * equal. Built on {@link tokenize} — same pipeline, stopwords included —
 * joined back with single spaces rather than kept as separate tokens, since
 * alias/name lookup (see `./alias-resolver.ts`) matches a whole term, not its
 * individual words.
 */
export function normalizeTerm(value: string): string {
  return tokenize(value).join(" ");
}
