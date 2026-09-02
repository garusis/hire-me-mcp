/**
 * Story-completeness scorer (#295 correction, independent Codex review,
 * agent package `1dd7ac7`, finding 2): #295's agent-evals section requires
 * "answers include grounded situation, actions, and results rather than
 * only adjectives or testimonials," scored by "a story-completeness scorer
 * that is resilient to prose formatting: it should score factual coverage
 * of the returned situation/actions/results, not require literal STAR
 * headings."
 *
 * This is a pure, deterministic heuristic — no model call — like every
 * other scorer in this package: it checks the answer text for three
 * independent linguistic signal classes (situation/context-setting,
 * concrete past-tense action, and a stated outcome), each scored as a
 * binary hit, so an answer that only strings adjectives together ("Marcos
 * is dedicated, thoughtful, and skilled") scores near zero — it names none
 * of the three — while a fluid-prose answer that actually narrates what
 * happened scores fully, with no STAR heading ("Situation:", "Action:",
 * "Result:") required anywhere.
 *
 * This is a coarse, keyword-class heuristic, not a semantic understanding
 * of the answer — a genuinely well-written answer using phrasing outside
 * these signal classes could still under-score. That's the same accepted
 * tradeoff every other regex-based scorer in this package makes (see
 * `./answer-assertions.ts`'s and `./groundedness.ts`'s own doc comments)
 * for zero-model-call determinism.
 */

import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

const SITUATION_REGEX =
  /\b(when|while|during|after|before|because|since|faced with|faced a|encountered|discovered|noticed|inherited|a (?:critical|production|legacy|complex|damaged|stalled|risky) )\b/i;

const ACTION_REGEX =
  /\b(built|implemented|designed|led|introduced|decided|investigated|debugged|migrated|proposed|wrote|fixed|reviewed|owned|created|drove|coordinated|refactored|architected|resolved|diagnosed|negotiated|persuaded|mentored|onboarded|rebuilt|renegotiated|took over|reduced|prioritized)\b/i;

const RESULT_REGEX =
  /\b(result(?:ed|s)?\b|as a result|which (?:reduced|improved|prevented|caught|fixed|eliminated|restored|retained)|ultimately|since then|today,?\s|the outcome|led to|allowed|enabled|ended up|was retained|no longer)\b/i;

const SIGNALS: readonly { label: string; regex: RegExp }[] = [
  { label: "situation", regex: SITUATION_REGEX },
  { label: "action", regex: ACTION_REGEX },
  { label: "result", regex: RESULT_REGEX },
];

/** One eval case's captured answer text — all this scorer needs. */
export interface StoryCompletenessTranscript {
  answer: string;
}

/**
 * Score `transcript.answer`'s factual completeness: 1 when the answer
 * carries all three of situation, action, and result signals, proportionally
 * lower per missing one. See module docs for what each signal class checks
 * and why this is prose-format-resilient (no STAR headings required).
 */
export function scoreStoryCompleteness(transcript: StoryCompletenessTranscript): ScoreResult {
  const missing = SIGNALS.filter((signal) => !signal.regex.test(transcript.answer)).map(
    (signal) => signal.label,
  );
  const passed = SIGNALS.length - missing.length;
  const reason =
    missing.length === 0
      ? `${passed}/${SIGNALS.length} story-completeness signal(s) held.`
      : `${passed}/${SIGNALS.length} story-completeness signal(s) held; missing: ${missing.join(", ")}.`;

  return { score: clampScore(passed / SIGNALS.length), reason };
}
