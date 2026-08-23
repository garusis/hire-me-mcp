/**
 * Deterministic, cheap theme classification for a chat question (#79). A
 * plain keyword/rules classifier over the fixed {@link QUESTION_THEMES}
 * taxonomy — no LLM call, no network I/O, same input always yields the
 * same output. The issue explicitly allows an LLM-based classifier later,
 * but requires it to run on already-scrubbed input and still only ever
 * write the label — this module is that "still only ever write the label"
 * contract's first (and, for now, only) implementation.
 *
 * The raw question text is the classifier's INPUT, never its output and
 * never persisted — callers must throw the input away after calling this
 * and store only the returned {@link QuestionTheme}.
 *
 * Rule order is significant: a question can match more than one bucket's
 * keywords (e.g. "does he know TypeScript" mentions both a skill verb and
 * a named technology), so rules are checked most-specific-first —
 * `technology`, `rates`, `availability`, and `skills` name concrete,
 * unambiguous nouns, while `experience` uses broader words ("background",
 * "career") that would otherwise swallow more specific questions.
 */

import { QUESTION_THEMES, type QuestionTheme } from "./taxonomy.js";

export type { QuestionTheme };
export { QUESTION_THEMES };

interface ThemeRule {
  theme: QuestionTheme;
  pattern: RegExp;
}

const TECHNOLOGY_KEYWORDS =
  /\b(typescript|javascript|react|next\.?js|node(?:\.js)?|python|golang|rust|java|kubernetes|docker|aws|gcp|azure|postgres|postgresql|graphql|sql|terraform|redis|kafka|tech stack|technology|technologies|framework|programming language)\b/i;

const RATES_KEYWORDS =
  /\b(rate|rates|salary|compensation|day rate|hourly|price|pricing|cost|budget|pay|contract terms)\b/i;

const AVAILABILITY_KEYWORDS =
  /\b(availab\w*|start date|when can (?:he|you) start|notice period|free to start|open to work)\b/i;

const SKILLS_KEYWORDS =
  /\b(skill|skills|proficient|proficiency|expertise|good at|strengths?|capable of|competent)\b/i;

const EXPERIENCE_KEYWORDS =
  /\b(experience|worked|work history|work background|background|career|years of|previous (?:job|role|company)|history)\b/i;

/**
 * Most-specific-first: a technology name or a rate/availability word wins
 * over the broader `experience`/`skills` buckets even when both could
 * plausibly match the same sentence.
 */
const RULES: ThemeRule[] = [
  { theme: "technology", pattern: TECHNOLOGY_KEYWORDS },
  { theme: "rates", pattern: RATES_KEYWORDS },
  { theme: "availability", pattern: AVAILABILITY_KEYWORDS },
  { theme: "skills", pattern: SKILLS_KEYWORDS },
  { theme: "experience", pattern: EXPERIENCE_KEYWORDS },
];

/**
 * Classifies a raw chat question into one of the fixed
 * {@link QUESTION_THEMES}, falling back to `"other"` when no rule matches.
 * Pure and deterministic — no I/O, no randomness, no LLM call.
 */
export function classifyQuestionTheme(question: string): QuestionTheme {
  for (const rule of RULES) {
    if (rule.pattern.test(question)) return rule.theme;
  }
  return "other";
}
