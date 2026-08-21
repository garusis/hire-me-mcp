/**
 * Relevance scorer (#72, strictness fix #143): does the answer address the
 * question actually asked? Deterministic keyword-overlap heuristic — no
 * judge model — so this scorer runs with zero model calls, same as
 * `groundedness.ts` and `gap-honesty.ts`.
 *
 * Every non-stopword term of the question is a "keyword" the answer is
 * expected to engage with; the score is the fraction of those keywords that
 * appear, after light stemming, among the answer's own tokens. A question
 * with no extractable keywords scores 1 (nothing to check against) rather
 * than 0 — that shouldn't happen for any real eval-dataset case, but a
 * scorer must never divide by zero.
 *
 * This intentionally measures topical overlap with the literal question,
 * not "was this a good response" — an off-topic question's *correct*
 * answer (a brief redirect, per the system prompt's redirect policy) is
 * expected to score LOW here, since it doesn't engage the off-topic
 * question's own terms. That's the dataset's off-topic category's expected
 * shape, not a bug in this scorer.
 *
 * ## Strictness fix (#143)
 *
 * The first real, full-dataset run (#72, PR #142) found this heuristic
 * penalizing several perfectly-grounded, perfectly-honest answers down to
 * as low as 0.33 relevance — not because the answer drifted off-topic, but
 * because the ORIGINAL raw-substring-on-raw-text check demanded the
 * question's own literal spelling reappear in the answer. Two real, fixable
 * causes, confirmed against real transcripts from that run:
 *
 * 1. **Interrogative function words counted as keywords.** "where"/"how"/
 *    "why"/"when" (and similar) carry no topical content of their own — a
 *    correct answer addresses them by naming the thing asked for (a place,
 *    a method), never by echoing the word "where" itself. Extended
 *    {@link EXTRA_STOPWORDS} beyond `tokenize`'s own general-purpose list to
 *    drop these, plus interview-specific filler (pronouns, "favorite",
 *    "other", the apostrophe-stripped "whats").
 * 2. **No tolerance for a plural/verb-inflection mismatch.** The question
 *    "What has he built with LLMs...?" was answered correctly using
 *    singular "LLM" — a real, honest paraphrase the old raw-substring check
 *    still failed, since "llms" is not a substring of text that only ever
 *    says "llm". {@link stem} strips a small, conservative set of
 *    plural/verb suffixes (mirroring the same transform applied to both the
 *    question's keywords and the answer's tokens, so an exact literal match
 *    is never broken by this — only extended).
 *
 * Both the question and the answer are tokenized through `packages/core`'s
 * shared {@link tokenize} (`@hire-me-mcp/core`) — the same
 * diacritic-stripping, punctuation-stripping, deterministic pipeline the
 * search module uses — rather than a second, ad hoc regex, so this
 * scorer's own normalization can't silently drift from the project's one
 * normalization module.
 */

import { tokenize } from "@hire-me-mcp/core";
import type { EvalTranscript, ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

/**
 * Interview-question-specific filler `tokenize`'s own general-purpose
 * stopword list doesn't cover: interrogatives (no topical content of their
 * own), pronouns, and a couple of dataset-specific fillers. Grown only when
 * a real question demonstrates a false-positive keyword, per `tokenize`'s
 * own stopword-list policy.
 */
const EXTRA_STOPWORDS = new Set([
  "what",
  "whats",
  "has",
  "have",
  "had",
  "he",
  "his",
  "him",
  "does",
  "did",
  "do",
  "your",
  "you",
  "i",
  "it",
  "favorite",
  "which",
  "who",
  "whose",
  "where",
  "how",
  "why",
  "when",
  "other",
]);

/** At or below this length, a token is kept as-is — too short for a suffix strip to be meaningful, and short enough that mangling it (e.g. "aws" -> "aw") would create a false negative. */
const MIN_STEM_LENGTH = 3;

/**
 * A small, conservative suffix stripper — not a full stemmer, just enough
 * plural/verb-inflection tolerance to stop a real paraphrase ("LLM" for
 * "LLMs", "mentoring" for "mentored") from being penalized as off-topic.
 * Applied identically to question keywords and answer tokens, so it only
 * ever widens what counts as a match — a token with no matching suffix
 * (including anything already `MIN_STEM_LENGTH` or shorter) passes through
 * unchanged, and two forms that were already identical stay identical.
 */
function stem(token: string): string {
  if (token.length <= MIN_STEM_LENGTH) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(?:ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("ing") && token.length > 6) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 5) return token.slice(0, -2);
  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

/** Tokenize, drop interview-specific filler on top of `tokenize`'s own stopwords and any 2-character-or-shorter noise token (e.g. "ai" alone is too coarse a keyword to require verbatim), and stem — the shared pipeline both the question's keywords and the answer's tokens go through. */
function stemmedTokens(text: string): string[] {
  return tokenize(text)
    .filter((token) => token.length >= 3 && !EXTRA_STOPWORDS.has(token))
    .map(stem);
}

function extractKeywords(question: string): string[] {
  return Array.from(new Set(stemmedTokens(question)));
}

/** Score how well a captured eval transcript's answer addresses the question it was asked. */
export function scoreRelevance(transcript: EvalTranscript): ScoreResult {
  const keywords = extractKeywords(transcript.question);
  if (keywords.length === 0) {
    return { score: 1, reason: "Question yielded no extractable keywords to check against." };
  }

  const answerTokens = new Set(stemmedTokens(transcript.answer));
  const matched = keywords.filter((keyword) => answerTokens.has(keyword));
  const score = clampScore(matched.length / keywords.length);
  const reason = `${matched.length}/${keywords.length} question keyword(s) (stemmed) addressed in the answer.`;

  return { score, reason };
}
