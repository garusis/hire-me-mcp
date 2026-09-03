/**
 * Story-completeness scorer (#295 correction, independent Codex review,
 * agent package `1dd7ac7`, finding 2 — then #295 second independent-review
 * correction, finding 2): #295's agent-evals section requires "answers
 * include grounded situation, actions, and results rather than only
 * adjectives or testimonials," scored by "a story-completeness scorer that
 * is resilient to prose formatting: it should score factual coverage of the
 * returned situation/actions/results, not require literal STAR headings."
 *
 * ## Grounded mode (the fix for finding 2's counterexample)
 *
 * The first correction's generic 3-signal linguistic-cue heuristic (see
 * `GENERIC_SIGNALS` below) had a real gap the second independent review
 * reproduced directly: "When a difficult situation appeared, Marcos built a
 * solution. As a result, it enabled success." scored 1.0 despite containing
 * NO fact from any real story — it merely imitates STAR-shaped connective
 * language. Generic cues alone cannot tell a genuinely grounded answer from
 * a fluent template.
 *
 * When the caller supplies `storyIds` (the case's acceptable story
 * candidates — see `../runner.ts`'s `storyIdsOf`), this scorer instead
 * checks the answer against `STORY_FACT_ANCHORS`: a small, per-story table
 * of concrete situation/action/result facts drawn directly from that
 * story's own committed content (`packages/career-data/content/stories/`),
 * one anchor pattern per signal class. Since a case may accept SEVERAL
 * candidate stories (an `any`/`all` `citationGroups` case), the score is the
 * BEST match across the supplied ids — the answer is expected to fully
 * ground exactly one real story, not blend generic phrasing across several.
 * Falls back to the generic heuristic only when none of the supplied
 * `storyIds` has a known anchors entry (or none were supplied at all) —
 * preserved for backward compatibility with the original correction's own
 * tests, which pin that heuristic's exact behavior on non-story-specific
 * input.
 *
 * Like every other scorer in this package, this remains pure, deterministic
 * regex matching — no model call and no semantic understanding of the
 * answer. That is still a coarse heuristic (a well-written answer using
 * distinct phrasing for the same real fact could under-score, the same
 * accepted tradeoff `./answer-assertions.ts` and `./groundedness.ts` make),
 * but requiring a real per-story fact, not just a STAR-shaped connective
 * word, closes the specific false-positive the review reproduced.
 */

import { parseCitations } from "../../citations.js";
import type { ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

interface SignalClass {
  label: string;
  regex: RegExp;
}

const GENERIC_SIGNALS: readonly SignalClass[] = [
  {
    label: "situation",
    regex:
      /\b(when|while|during|after|before|because|since|faced with|faced a|encountered|discovered|noticed|inherited|a (?:critical|production|legacy|complex|damaged|stalled|risky) )\b/i,
  },
  {
    label: "action",
    regex:
      /\b(built|implemented|designed|led|introduced|decided|investigated|debugged|migrated|proposed|wrote|fixed|reviewed|owned|created|drove|coordinated|refactored|architected|resolved|diagnosed|negotiated|persuaded|mentored|onboarded|rebuilt|renegotiated|took over|reduced|prioritized)\b/i,
  },
  {
    label: "result",
    regex:
      /\b(result(?:ed|s)?\b|as a result|which (?:reduced|improved|prevented|caught|fixed|eliminated|restored|retained)|ultimately|since then|today,?\s|the outcome|led to|allowed|enabled|ended up|was retained|no longer)\b/i,
  },
];

/**
 * Per-story fact anchors (#295 second independent-review correction, finding
 * 2), one situation/action/result regex per authored story, each anchored to
 * a specific fact from that story's own committed content — not a
 * paraphrase-tolerant generic cue. Keyed by stable story id (the same ids
 * `../dataset/story-manifest-cases.ts` cites).
 */
const STORY_FACT_ANCHORS: Readonly<Record<string, Readonly<Record<string, RegExp>>>> = {
  "xogito-client-account-recovery": {
    situation: /frustrat/i,
    action: /quick wins|meeting cadence/i,
    result: /trust returned|commissioned/i,
  },
  "mutual-informal-leadership": {
    situation: /hackathon|stalled/i,
    action: /renounced/i,
    result: /launched|handed .{0,20}government/i,
  },
  "cross-team-onboarding-framework": {
    situation: /no established onboarding|no clear person/i,
    action: /first contact|onboarding buddies/i,
    result: /15 people|adopted/i,
  },
  "house-numbers-communication-service-ownership": {
    situation: /different inboxes|manually determine/i,
    action: /webhook ingestion|llm.assisted extraction/i,
    result: /70\s*%|effective.triage/i,
  },
  "house-numbers-deterministic-document-checks": {
    situation: /nobody was using|hallucinat/i,
    action: /removed the open-ended llm|deterministic (?:checks?|validation)/i,
    result: /less than two weeks|stable,? reproducible/i,
  },
  "fullstack-labs-sap-migration": {
    situation: /legacy sap|financial calculations/i,
    action: /etl scripts?|rounding/i,
    result: /without data loss|legacy.system experts/i,
  },
  "house-numbers-prompt-platform-migration": {
    situation: /orq\.?ai|friction/i,
    action: /incremental migration|version.controlled files/i,
    result: /no significant interruption|eliminated .{0,20}platform cost/i,
  },
  "house-numbers-secure-public-document-upload": {
    situation: /wordpress|two out of every three/i,
    action: /captcha|rate limiting|hybrid routing/i,
    result: /complaints? .{0,20}stopped|audit history/i,
  },
  "house-numbers-zod-production-incident": {
    situation: /96 (?:times|restarts)|crash loop|zod/i,
    action: /contain(?:ed)? the cascade|regression tests?/i,
    result: /no permanent (?:data )?loss|reprocessed/i,
  },
  "house-numbers-vendor-extraction-contract": {
    situation: /never appeared|structured extraction/i,
    action: /inspected the payload|built the missing mocks/i,
    result: /vendor confirmed|(?:capabilit\w* .{0,20})?disabled|remained in the provider/i,
  },
  "house-numbers-loan-analysis-pipeline-decomposition": {
    situation: /monolith|one large orchestration/i,
    action: /three independently testable units|message bus/i,
    result: /reached production|easier to locate failures/i,
  },
  "mutual-sustainable-ownership-failure": {
    situation: /hackathon|stalled/i,
    action: /renounced/i,
    result: /do not consider .{0,20}a success|never recovered shared ownership/i,
  },
  "rokk3r-sustainable-performance-feedback": {
    situation: /rockstar developer|worked late into the night/i,
    action: /took a week away|communicating capacity/i,
    result: /quality and working rhythm restored|mvp successfully/i,
  },
  "belatrix-destructive-deployment-accountability": {
    situation: /dynamodb|shared development environment/i,
    action: /reported it|restricted the script/i,
    result: /rebuilt trust|access was restored/i,
  },
  "house-numbers-cross-service-debugging-skill": {
    situation: /on-call rotation|no shared investigation method/i,
    action: /on-call reporting command|reusable (?:agent )?skill/i,
    result: /versioned process|new relic|evidence.backed/i,
  },
  "house-numbers-ai-pivot-after-paternity-leave": {
    situation: /paternity leave|b2c.{0,10}b2b|pivot/i,
    action: /spoke openly with .{0,10}cto|impostor syndrome/i,
    result: /i stayed|production llm and agentic systems/i,
  },
};

/** One eval case's captured answer text — all this scorer needs. */
export interface StoryCompletenessTranscript {
  answer: string;
}

function scoreAgainstSignals(answer: string, signals: readonly SignalClass[]): ScoreResult {
  const missing = signals.filter((signal) => !signal.regex.test(answer)).map((s) => s.label);
  const passed = signals.length - missing.length;
  const reason =
    missing.length === 0
      ? `${passed}/${signals.length} story-completeness signal(s) held.`
      : `${passed}/${signals.length} story-completeness signal(s) held; missing: ${missing.join(", ")}.`;
  return { score: clampScore(passed / signals.length), reason };
}

/** `scoreAgainstSignals` against one known story's real fact anchors, labeled with that story id in the reason. */
function scoreAgainstStory(answer: string, storyId: string): ScoreResult {
  const anchors = STORY_FACT_ANCHORS[storyId];
  if (!anchors) throw new Error(`no fact anchors registered for story id "${storyId}"`);
  const signals = Object.entries(anchors).map(([label, regex]) => ({ label, regex }));
  const scored = scoreAgainstSignals(answer, signals);
  return { score: scored.score, reason: `[${storyId}] ${scored.reason}` };
}

/** Every `story` entityId actually cited (`[cite:story:...]`) in `answer`, per the shared `parseCitations`. */
function citedStoryIds(answer: string): Set<string> {
  return new Set(
    parseCitations(answer)
      .filter((marker) => marker.entityType === "story")
      .map((marker) => marker.entityId),
  );
}

/**
 * Score `transcript.answer`'s factual completeness against `storyIds` (the
 * case's acceptable story candidates). When `storyIds` names at least one
 * story with a `STORY_FACT_ANCHORS` entry, scores in grounded mode (see
 * module docs); otherwise falls back to the original generic 3-class
 * linguistic-cue heuristic (situation/action/result), preserved for
 * backward compatibility with cases that don't name a known story.
 *
 * Grounded mode is bound to the story the answer ACTUALLY CITES (#295
 * third-independent-review correction, finding 2): "The scorer receives
 * every acceptable story id and takes the best factual match. An answer
 * containing a complete Mutual narrative while citing only Xogito scores
 * storyCompleteness: 1.0 because the Mutual anchors match." Completeness is
 * scored only against the intersection of `storyIds` and the answer's own
 * parsed `story` citations — an uncited candidate's facts, however
 * complete, can never substitute for the story actually cited. An answer
 * that cites none of the known acceptable candidates scores 0.
 *
 * `mode` (#295 third-independent-review correction, finding 3) distinguishes
 * a single-source/`any` case ("best of the cited-and-acceptable stories" —
 * the manifest's one-story-answer semantics) from a cross-cutting `all`
 * case, which instead requires FULL situation/action/result coverage for
 * EVERY required story: the score is the WORST of the required stories'
 * individual completeness (a story required but not cited scores 0 for
 * that story), never a best-of-one — a bare extra citation with no facts
 * must fail the case, not be diluted away by one well-narrated story.
 */
export function scoreStoryCompleteness(
  transcript: StoryCompletenessTranscript,
  storyIds: readonly string[] = [],
  mode: "any" | "all" = "any",
): ScoreResult {
  const known = [...new Set(storyIds)].filter((id) => id in STORY_FACT_ANCHORS);
  if (known.length === 0) {
    return scoreAgainstSignals(transcript.answer, GENERIC_SIGNALS);
  }

  const cited = citedStoryIds(transcript.answer);

  if (mode === "all") {
    const scored = known.map((id) =>
      cited.has(id)
        ? scoreAgainstStory(transcript.answer, id)
        : { score: 0, reason: `[${id}] required but not cited` },
    );
    const worst = scored.reduce((min, current) => (current.score < min.score ? current : min));
    return { score: clampScore(worst.score), reason: scored.map((s) => s.reason).join(" | ") };
  }

  const citedKnown = known.filter((id) => cited.has(id));
  if (citedKnown.length === 0) {
    return {
      score: 0,
      reason: `answer did not cite any of the acceptable stories with known facts [${known.join(", ")}]`,
    };
  }
  const scored = citedKnown.map((id) => scoreAgainstStory(transcript.answer, id));
  return scored.reduce((best, current) => (current.score > best.score ? current : best));
}
