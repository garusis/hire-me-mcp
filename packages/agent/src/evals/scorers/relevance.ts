/**
 * Relevance scorer (#72): does the answer address the question actually
 * asked? Deterministic keyword-overlap heuristic — no judge model — so this
 * scorer runs with zero model calls, same as `groundedness.ts` and
 * `gap-honesty.ts`.
 *
 * Every non-stopword term of at least 3 characters in the question is a
 * "keyword" the answer is expected to engage with; the score is the
 * fraction of those keywords that appear (as a case-insensitive substring
 * match) somewhere in the answer. A question with no extractable keywords
 * scores 1 (nothing to check against) rather than 0 — that shouldn't happen
 * for any real eval-dataset case, but a scorer must never divide by zero.
 *
 * This intentionally measures topical overlap with the literal question,
 * not "was this a good response" — an off-topic question's *correct*
 * answer (a brief redirect, per the system prompt's redirect policy) is
 * expected to score LOW here, since it doesn't engage the off-topic
 * question's own terms. That's the dataset's off-topic category's expected
 * shape, not a bug in this scorer.
 */

import type { EvalTranscript, ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

const STOPWORDS = new Set([
  "what",
  "has",
  "have",
  "had",
  "he",
  "his",
  "him",
  "with",
  "and",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "of",
  "to",
  "in",
  "on",
  "for",
  "about",
  "does",
  "did",
  "do",
  "your",
  "you",
  "i",
  "that",
  "this",
  "it",
  "favorite",
  "which",
  "who",
]);

function extractKeywords(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const keywords = words.filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return Array.from(new Set(keywords));
}

/** Score how well a captured eval transcript's answer addresses the question it was asked. */
export function scoreRelevance(transcript: EvalTranscript): ScoreResult {
  const keywords = extractKeywords(transcript.question);
  if (keywords.length === 0) {
    return { score: 1, reason: "Question yielded no extractable keywords to check against." };
  }

  const answerLower = transcript.answer.toLowerCase();
  const matched = keywords.filter((keyword) => answerLower.includes(keyword));
  const score = clampScore(matched.length / keywords.length);
  const reason = `${matched.length}/${keywords.length} question keyword(s) addressed in the answer.`;

  return { score, reason };
}
