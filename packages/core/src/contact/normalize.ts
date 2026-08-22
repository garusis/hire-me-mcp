/**
 * Normalizes a schema-valid contact submission (#20, epic #8) before it is
 * accepted: unify line endings, strip control characters, trim whitespace,
 * collapse runaway blank lines, and cap the stored `context` string. Pure —
 * no I/O, no clock, no randomness — so the same input always normalizes to
 * the same output.
 */

import type { ContactSubmissionInput } from "./schema.js";
import { CONTACT_CONTEXT_MAX_LENGTH } from "./schema.js";

/** A normalized, accepted contact submission — the honeypot field is dropped. */
export interface NormalizedContactSubmission {
  name: string;
  contact: string;
  message: string;
  context?: string;
}

/** Unicode "control" category (C0/C1 controls, DEL, ...) — matched per line, see {@link stripControlChars}. */
const CONTROL_CHARS = /\p{Cc}/gu;

/** Runs of 3+ blank lines — collapsed to a single blank line (one paragraph break). */
const RUNAWAY_BLANK_LINES = /\n{3,}/g;

/**
 * Strips Unicode control characters from `text`, one line at a time, so
 * `\n` — itself a control character, but the one separator normalized
 * multi-line messages must keep — is never touched: it's the split
 * delimiter, never part of what {@link CONTROL_CHARS} scans.
 */
function stripControlChars(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(CONTROL_CHARS, ""))
    .join("\n");
}

/**
 * Normalizes one free-text field: unifies CRLF/CR to LF, strips control
 * characters (keeping `\n`), collapses runaway blank lines, then trims
 * leading/trailing whitespace.
 */
function normalizeField(raw: string): string {
  const unifiedLineEndings = raw.replace(/\r\n?/g, "\n");
  const withoutControlChars = stripControlChars(unifiedLineEndings);
  const collapsedBlankLines = withoutControlChars.replace(RUNAWAY_BLANK_LINES, "\n\n");
  return collapsedBlankLines.trim();
}

/**
 * Normalizes a schema-valid {@link ContactSubmissionInput} into a
 * {@link NormalizedContactSubmission}. The honeypot field is intentionally
 * dropped — it exists only for spam detection (see `./heuristics.ts`), never
 * for storage. `context` is capped again at {@link CONTACT_CONTEXT_MAX_LENGTH}
 * as a defensive measure, even though the schema already enforces that cap
 * at parse time.
 */
export function normalizeContactSubmission(
  input: ContactSubmissionInput,
): NormalizedContactSubmission {
  const normalized: NormalizedContactSubmission = {
    name: normalizeField(input.name),
    contact: normalizeField(input.contact),
    message: normalizeField(input.message),
  };

  if (input.context !== undefined) {
    normalized.context = normalizeField(input.context).slice(0, CONTACT_CONTEXT_MAX_LENGTH);
  }

  return normalized;
}
