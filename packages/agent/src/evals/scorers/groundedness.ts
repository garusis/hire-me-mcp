/**
 * Groundedness scorer (#72): every factual claim about the candidate's
 * experience must be traceable to a tool result actually returned during
 * the run — this scorer checks both directions the system prompt's
 * grounding rules (`../../prompt/sections.ts`) demand:
 *
 * 1. **Citation validity** — every `[cite:...]` marker in the answer
 *    (parsed with the shared `parseCitations`, `../../citations.ts`) must
 *    point at an `(entityType, entityId)` pair some tool call in this run
 *    actually returned. A marker citing an entity the run never produced
 *    (a fabricated or mismatched pointer) lowers this component.
 * 2. **Sentence coverage** — a sentence that reads as a factual claim about
 *    the candidate's experience (matches a broad indicator-word heuristic)
 *    must itself carry a citation marker. An honest gap statement ("he
 *    hasn't done X") is excluded from this check — gap honesty is the
 *    dedicated `gap-honesty.ts` scorer's job, not this one's; a gap
 *    sentence naming its closest evidence still gets credit for whatever
 *    marker it does carry, but isn't penalized for the parts that
 *    correctly state an absence rather than a claim.
 *
 * The final score is the product of both components, so an answer that
 * fabricates a citation AND leaves other claims uncited scores low on both
 * counts rather than being rescued by one passing check.
 */

import { parseCitations } from "../../citations.js";
import type { EvalTranscript, ScoreResult } from "./types.js";
import { clampScore } from "./types.js";

const FACTUAL_INDICATOR_REGEX =
  /\b(built|led|use[sd]?|worked|implemented|shipped|managed|architected|architecting|developed|delivered|designed|integrated|migrated|owns?|years?|engineer|experience|production|deployed|maintained|created|wrote|scaled)\b/i;

const GAP_LANGUAGE_REGEX =
  /hasn'?t done|no production|closest evidence|hasn'?t touched|doesn'?t have (production )?experience|no experience with/i;

const CITATION_MARKER_REGEX = /\[cite:/;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isFactualClaim(sentence: string): boolean {
  return FACTUAL_INDICATOR_REGEX.test(sentence) && !GAP_LANGUAGE_REGEX.test(sentence);
}

/** Score a captured eval transcript's groundedness — see module docs for the two components combined. */
export function scoreGroundedness(transcript: EvalTranscript): ScoreResult {
  const markers = parseCitations(transcript.answer);
  const validMarkers = markers.filter((marker) =>
    transcript.toolCitations.some(
      (citation) =>
        citation.entityType === marker.entityType && citation.entityId === marker.entityId,
    ),
  );
  const citationValidity = markers.length === 0 ? 1 : validMarkers.length / markers.length;

  const factualSentences = splitSentences(transcript.answer).filter(isFactualClaim);
  const citedFactualSentences = factualSentences.filter((sentence) =>
    CITATION_MARKER_REGEX.test(sentence),
  );
  const sentenceCoverage =
    factualSentences.length === 0 ? 1 : citedFactualSentences.length / factualSentences.length;

  const score = clampScore(citationValidity * sentenceCoverage);
  const reason =
    `${validMarkers.length}/${markers.length} citation marker(s) matched a tool result ` +
    `actually returned this run; ${citedFactualSentences.length}/${factualSentences.length} ` +
    "factual-claim sentence(s) carried a citation.";

  return { score, reason };
}
