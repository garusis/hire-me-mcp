/**
 * Error mapping for the MCP tool adapter layer: every failure a tool
 * handler can produce collapses into exactly one of three stable,
 * machine-readable codes, with a message guaranteed not to leak stack
 * traces, absolute paths, or environment values.
 *
 * - `invalid_input` — the tool's Zod input schema rejected the arguments.
 *   The message is the schema's own field-level complaint (safe: it names
 *   parameter fields, never filesystem paths or process internals) — built
 *   in `define-tool.ts`, where the schema is validated.
 * - `domain_error` — the tool handler threw a {@link ToolDomainError}: an
 *   intentional, already-sanitized failure raised by adapter/domain code.
 *   Its message is authored by us and passed through unmodified.
 * - `internal_error` — anything else: an unexpected exception, a thrown
 *   non-`Error` value, a bug. The original error is never serialized to the
 *   client — only a fixed, generic message — because an arbitrary caught
 *   error's `.message` or `.stack` cannot be assumed safe to expose.
 *
 * A domain "no results" / "not claimed" answer is NOT an error — those are
 * ordinary successful `DomainResult` payloads (see `envelope.ts`) and never
 * reach this module.
 */

export type ToolErrorCode = "invalid_input" | "domain_error" | "internal_error";

/** Thrown by tool handlers for an intentional, already-safe-to-show domain failure. */
export class ToolDomainError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ToolDomainError";
  }
}

/** The sanitized `{ code, message }` pair every tool error result carries. */
export interface ToolErrorPayload {
  code: ToolErrorCode;
  message: string;
}

const GENERIC_INTERNAL_ERROR_MESSAGE = "An unexpected error occurred while running this tool.";

/**
 * Maps a thrown value — a {@link ToolDomainError}, an arbitrary `Error`, or
 * a non-`Error` throw — to a sanitized {@link ToolErrorPayload}. Only
 * {@link ToolDomainError} messages are trusted enough to surface verbatim;
 * every other thrown value maps to the same fixed, generic message so a bug
 * or an unhandled exception can never leak implementation detail.
 */
export function mapThrownError(error: unknown): ToolErrorPayload {
  if (error instanceof ToolDomainError) {
    return { code: "domain_error", message: error.message };
  }
  return { code: "internal_error", message: GENERIC_INTERNAL_ERROR_MESSAGE };
}

/** An MCP `tools/call` error result: `isError: true`, plus the sanitized code/message as structured content. */
export interface ToolErrorResult {
  content: [{ type: "text"; text: string }];
  structuredContent: ToolErrorPayload;
  isError: true;
}

/** Builds the wire-ready error result from a sanitized {@link ToolErrorPayload}. */
export function buildToolErrorResult(payload: ToolErrorPayload): ToolErrorResult {
  const text = JSON.stringify(payload);
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
    isError: true,
  };
}
