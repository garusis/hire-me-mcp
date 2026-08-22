/**
 * `evaluateContactSubmission()` — the single pure evaluation function for
 * an inbound contact submission (#20, epic #8): validates `input` (an
 * `unknown`) against `contactSubmissionSchema`, runs the spam heuristics
 * from `./heuristics.ts` against the normalized fields, and returns a typed
 * accepted/rejected decision. No I/O — no network, no filesystem, no
 * clock-dependent branching — so the same input always yields the same
 * decision (see the determinism tests in `./evaluate.test.ts`).
 *
 * This repo is a public portfolio: `ContactRejectionReason` is a small,
 * closed, exported union that is safe to return to an anonymous caller. It
 * never names which heuristic fired or leaks a threshold value — that
 * detail is internal (`ContactRejectionDetail`), for logging/debugging by
 * the caller, not for echoing back to whoever submitted the form.
 */

import {
  hasAllCapsFlood,
  hasLinkFlood,
  hasRepetitionFlood,
  hasSpamKeyword,
  honeypotFilled,
  isEmptyAfterTrim,
  isMostlyLinks,
} from "./heuristics.js";
import type { NormalizedContactSubmission } from "./normalize.js";
import { normalizeContactSubmission } from "./normalize.js";
import { contactSubmissionSchema } from "./schema.js";

/**
 * The closed set of safe rejection reasons. Deliberately does not
 * distinguish *which* heuristic tripped (see `ContactRejectionDetail` for
 * that) or reveal any threshold, so an attacker cannot binary-search the
 * filter via the reason code alone.
 */
export type ContactRejectionReason = "invalid_input" | "too_long" | "rejected_as_spam";

/** Identifies one of the individually-testable heuristics in `./heuristics.ts`. */
export type HeuristicId =
  | "honeypot"
  | "linkFlood"
  | "mostlyLinks"
  | "repetitionFlood"
  | "allCapsFlood"
  | "spamKeyword"
  | "emptyAfterTrim";

/**
 * Internal, debugging-only detail naming which heuristic(s) fired. Empty
 * when the rejection happened at schema validation (before any heuristic
 * ran) — see the `too_long`/`invalid_input` cases below.
 */
export interface ContactRejectionDetail {
  firedHeuristics: HeuristicId[];
}

/** An accepted submission, normalized and ready to hand to a transport layer (email delivery, MCP tool response, ...). */
export interface ContactAccepted {
  status: "accepted";
  submission: NormalizedContactSubmission;
}

/** A rejected submission: a safe `reason` plus the internal `detail` naming what fired. */
export interface ContactRejected {
  status: "rejected";
  reason: ContactRejectionReason;
  detail: ContactRejectionDetail;
}

/** The typed result of {@link evaluateContactSubmission}: exactly one of these two shapes. */
export type ContactEvaluationResult = ContactAccepted | ContactRejected;

function rejected(
  reason: ContactRejectionReason,
  firedHeuristics: HeuristicId[] = [],
): ContactRejected {
  return { status: "rejected", reason, detail: { firedHeuristics } };
}

/**
 * Validates and evaluates an unknown inbound contact submission.
 *
 * 1. Parses `input` against `contactSubmissionSchema`. A schema violation is
 *    rejected immediately — before any heuristic runs — as `too_long` (if
 *    any issue is a max-length violation) or `invalid_input` (everything
 *    else: missing/wrong-typed fields, empty required strings, ...).
 * 2. Normalizes the parsed fields (`./normalize.ts`).
 * 3. Runs every heuristic (`./heuristics.ts`) against the normalized
 *    submission (and the raw honeypot value). Any heuristic firing rejects
 *    the submission as `rejected_as_spam`, recording every heuristic that
 *    fired — not just the first — in `detail.firedHeuristics`.
 * 4. Otherwise, returns the normalized submission as accepted.
 */
export function evaluateContactSubmission(input: unknown): ContactEvaluationResult {
  const parsed = contactSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const isTooLong = parsed.error.issues.some((issue) => issue.code === "too_big");
    return rejected(isTooLong ? "too_long" : "invalid_input");
  }

  const normalized = normalizeContactSubmission(parsed.data);

  const firedHeuristics: HeuristicId[] = [];
  if (honeypotFilled(parsed.data)) {
    firedHeuristics.push("honeypot");
  }
  if (isEmptyAfterTrim(normalized)) {
    firedHeuristics.push("emptyAfterTrim");
  }
  if (hasLinkFlood(normalized.message)) {
    firedHeuristics.push("linkFlood");
  }
  if (isMostlyLinks(normalized.message)) {
    firedHeuristics.push("mostlyLinks");
  }
  if (hasRepetitionFlood(normalized.message)) {
    firedHeuristics.push("repetitionFlood");
  }
  if (hasAllCapsFlood(normalized.message)) {
    firedHeuristics.push("allCapsFlood");
  }
  if (hasSpamKeyword(normalized.message)) {
    firedHeuristics.push("spamKeyword");
  }

  if (firedHeuristics.length > 0) {
    return rejected("rejected_as_spam", firedHeuristics);
  }

  return { status: "accepted", submission: normalized };
}
