/**
 * The last line of defense before an analytics event reaches Postgres
 * (#79): every field is checked against the fixed taxonomies in
 * `taxonomy.ts` and against pattern checks for shapes that must never be
 * stored (an IP address, an email address, or a string too long to be a
 * coarse label). `analytics-repository.ts`'s insert functions call these
 * before writing anything — there is no code path to the database that
 * skips them.
 *
 * This is a structural guarantee, not just an input filter: because
 * `toolName`/`theme`/etc. must be members of a small closed list (or, for
 * `toolName`, a short label matching {@link TOOL_NAME_PATTERN}), a raw
 * chat question or a raw contact message can never pass as a valid value
 * for any field — it either isn't a member of the enum (`theme`) or fails
 * the shape/length check (`toolName`). There is no field on either event
 * type that raw free text could be smuggled into and still validate.
 */

import {
  type AnalyticsSurface,
  QUESTION_THEMES,
  type QuestionTheme,
  SURFACES,
  TOOL_OUTCOMES,
  type ToolOutcome,
} from "./taxonomy.js";

/** Thrown when an analytics event fails scrubbing — never caught and silently dropped; callers must fix the event. */
export class AnalyticsScrubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsScrubError";
  }
}

/** A coarse label (tool name) is never this long — a real sentence/question is. */
const MAX_LABEL_LENGTH = 64;

/** kebab-case-ish tool/step identifiers only — no spaces, no punctuation a sentence would have. */
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}[a-z0-9]$/;

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;
const IPV6_PATTERN = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}\b/;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function assertNoIdentifyingShape(value: string, field: string): void {
  if (EMAIL_PATTERN.test(value)) {
    throw new AnalyticsScrubError(`${field} looks like an email address and cannot be stored`);
  }
  if (IPV4_PATTERN.test(value) || IPV6_PATTERN.test(value)) {
    throw new AnalyticsScrubError(`${field} looks like an IP address and cannot be stored`);
  }
}

function assertMember<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): asserts value is T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new AnalyticsScrubError(
      `${field} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(value)})`,
    );
  }
}

function assertNonNegativeLatency(latencyMs: number, field: string): void {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    throw new AnalyticsScrubError(`${field} must be a non-negative, finite number of milliseconds`);
  }
}

/** Raw input a tool event is built from — same shape as {@link ScrubbedToolEvent}, pre-validation. */
export interface ToolEventInput {
  surface: AnalyticsSurface;
  toolName: string;
  outcome: ToolOutcome;
  latencyMs: number;
}

/** A {@link ToolEventInput} that has passed every scrubbing check. */
export type ScrubbedToolEvent = ToolEventInput;

/**
 * Validates a tool event before it is allowed anywhere near the database.
 * Rejects (throws {@link AnalyticsScrubError}, never returns a partially
 * fixed-up value): a `surface`/`outcome` outside the fixed taxonomy, a
 * `toolName` that isn't a short label-shaped string, a `toolName` that
 * looks like an email or IP address, or a negative latency.
 */
export function scrubToolEvent(input: ToolEventInput): ScrubbedToolEvent {
  assertMember(input.surface, SURFACES, "surface");
  assertMember(input.outcome, TOOL_OUTCOMES, "outcome");
  assertNonNegativeLatency(input.latencyMs, "latencyMs");

  if (
    typeof input.toolName !== "string" ||
    input.toolName.length === 0 ||
    input.toolName.length > MAX_LABEL_LENGTH ||
    !TOOL_NAME_PATTERN.test(input.toolName)
  ) {
    throw new AnalyticsScrubError(
      "toolName must be a short, label-shaped identifier — raw text cannot be stored",
    );
  }
  assertNoIdentifyingShape(input.toolName, "toolName");

  return {
    surface: input.surface,
    toolName: input.toolName,
    outcome: input.outcome,
    latencyMs: input.latencyMs,
  };
}

/** Raw input a question event is built from — same shape as {@link ScrubbedQuestionEvent}, pre-validation. */
export interface QuestionEventInput {
  theme: QuestionTheme;
  latencyMs: number;
  usedRetrieval: boolean;
}

/** A {@link QuestionEventInput} that has passed every scrubbing check. */
export type ScrubbedQuestionEvent = QuestionEventInput;

/**
 * Validates a question event before it is allowed anywhere near the
 * database. Because `theme` must be a member of {@link QUESTION_THEMES},
 * a raw question or a raw contact message can never pass through this
 * field — it simply isn't one of the six allowed strings.
 */
export function scrubQuestionEvent(input: QuestionEventInput): ScrubbedQuestionEvent {
  assertMember(input.theme as string, QUESTION_THEMES, "theme");
  assertNonNegativeLatency(input.latencyMs, "latencyMs");
  if (typeof input.usedRetrieval !== "boolean") {
    throw new AnalyticsScrubError("usedRetrieval must be a boolean");
  }

  return { theme: input.theme, latencyMs: input.latencyMs, usedRetrieval: input.usedRetrieval };
}
