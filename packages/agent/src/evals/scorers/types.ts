/**
 * Shared types and helpers for the eval suite's scorers (#72).
 *
 * A scorer takes a captured transcript from one eval case run against the
 * real agent — the question asked, the answer produced, and the citations
 * actually returned by the tool calls made during that run (parsed from
 * `DomainResult.citations`, per `packages/core`'s `createDomainResult`) —
 * and returns a normalized `[0, 1]` score plus a short human-readable
 * reason. All three scorers in this package are pure functions: no model
 * calls, no I/O, so `*.test.ts` files exercise them on fixture transcripts
 * with zero network access (issue #72's "deterministic scorer unit tests"
 * requirement).
 */

import type { CitableEntityType } from "../../citations.js";

/** A citation actually returned by a tool call captured during an eval run — the (entityType, entityId) pair a groundedness check cross-references parsed answer markers against. */
export interface ReturnedCitation {
  entityType: CitableEntityType;
  entityId: string;
  fragment?: string;
}

/** One eval case's captured run: the question asked, the agent's final answer text, and every citation actually returned by a tool call made during that run. */
export interface EvalTranscript {
  question: string;
  answer: string;
  toolCitations: ReturnedCitation[];
}

/** A scorer's normalized output: a `[0, 1]` score plus a short, human-readable explanation. */
export interface ScoreResult {
  score: number;
  reason: string;
}

/**
 * Clamp a raw score into `[0, 1]` and round to 4 decimal places, so scorer
 * output is stable for report snapshots/comparisons instead of carrying
 * floating-point noise from division.
 */
export function clampScore(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 10_000) / 10_000;
}
