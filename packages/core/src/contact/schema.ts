/**
 * The Zod schema for an inbound contact submission (#20, epic #8). Field
 * lengths are enforced here — hard, schema-level caps — so an oversized
 * payload is rejected before any heuristic in `./heuristics.ts` ever runs
 * (see `./evaluate.ts`).
 *
 * Deliberately **not** trimming at the schema level: a whitespace-only field
 * (raw length >= 1) is meant to pass this schema and be caught instead by
 * the `emptyAfterTrim` heuristic, which is individually unit-tested. Actual
 * trimming/normalization of accepted submissions happens in `./normalize.ts`.
 */

import { z } from "zod";

/** Max length of the `name` field. */
export const CONTACT_NAME_MAX_LENGTH = 200;
/** Max length of the `contact` field (a free-form email/handle/URL, not assumed to be an email). */
export const CONTACT_CONTACT_MAX_LENGTH = 320;
/** Max length of the `message` field. */
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
/** Max length of the optional `context` field. */
export const CONTACT_CONTEXT_MAX_LENGTH = 300;
/** Max length of the honeypot field — capped like every other field, even though legitimate clients leave it empty. */
export const CONTACT_HONEYPOT_MAX_LENGTH = 500;

/**
 * Schema for an inbound contact submission. `name`, `contact` and `message`
 * are required (min length 1, so an empty string is rejected outright —
 * distinct from a whitespace-only string, which passes here and is caught
 * by the `emptyAfterTrim` heuristic instead). `context` is an optional short
 * string describing where/why the submission came from. `honeypot` is an
 * optional field legitimate clients leave empty; it defaults to `""` so
 * every parsed submission always has a `honeypot: string` to check.
 */
export const contactSubmissionSchema = z.object({
  name: z.string().min(1).max(CONTACT_NAME_MAX_LENGTH),
  contact: z.string().min(1).max(CONTACT_CONTACT_MAX_LENGTH),
  message: z.string().min(1).max(CONTACT_MESSAGE_MAX_LENGTH),
  context: z.string().max(CONTACT_CONTEXT_MAX_LENGTH).optional(),
  honeypot: z.string().max(CONTACT_HONEYPOT_MAX_LENGTH).optional().default(""),
});

/** The parsed shape of a schema-valid contact submission, before heuristics/normalization. */
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
