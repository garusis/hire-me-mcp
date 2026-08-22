/**
 * The `contact` module's own public surface (#20, epic #8) — a
 * transport-agnostic contact-submission service: Zod validation, spam
 * heuristics, and normalization, with no I/O. Re-exported from this
 * package's entry point (`../index.ts`) so the future MCP `contact` tool
 * (epic #3) and chat `contact` tool (epic #5) import one function rather
 * than reimplementing validation.
 */

export type {
  ContactAccepted,
  ContactEvaluationResult,
  ContactRejected,
  ContactRejectionDetail,
  ContactRejectionReason,
  HeuristicId,
} from "./evaluate.js";
export { evaluateContactSubmission } from "./evaluate.js";
export type { NormalizedContactSubmission } from "./normalize.js";
export { normalizeContactSubmission } from "./normalize.js";
export type { ContactSubmissionInput } from "./schema.js";
export {
  CONTACT_CONTACT_MAX_LENGTH,
  CONTACT_CONTEXT_MAX_LENGTH,
  CONTACT_HONEYPOT_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  contactSubmissionSchema,
} from "./schema.js";
