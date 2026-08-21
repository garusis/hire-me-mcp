/**
 * Client-side error-code -> copy map for the chat surface (#70).
 *
 * `POST /api/chat`'s `stream-errors.ts` (#67) writes a `type: "error"`
 * stream part whose text is `JSON.stringify({ code, message })` — a small,
 * closed, machine-readable code plus a fixed safe message. This module is
 * the client's mirror: `parseChatErrorText` recovers that `{ code,
 * message }` shape from the raw `errorText` the AI SDK's `useChat` surfaces
 * as `error.message`, and `describeChatError` maps a code to UI copy
 * (title, longer description, and whether a retry makes sense).
 *
 * The guardrails task (#68, running in parallel) owns the server-side code
 * set and may add codes this file doesn't know about yet (e.g. a
 * conversation-too-long limit). `describeChatError` is written generically
 * against that possibility: known codes get tailored copy,
 * `KNOWN_CHAT_ERROR_CODES` documents the ones this UI has bespoke copy for
 * today, and anything else — including a code #68 introduces after this
 * PR merges — falls back to `FALLBACK_ERROR_DESCRIPTION` rather than
 * failing to render or blocking on a follow-up UI change.
 */

/** Error codes this UI has bespoke copy for. Mirrors `stream-errors.ts`'s `StreamErrorCode`, plus `conversation_too_long` (#68, not yet emitted server-side as of this PR). */
export const KNOWN_CHAT_ERROR_CODES = [
  "rate_limited",
  "conversation_too_long",
  "timeout",
  "upstream_error",
  "unknown",
] as const;

export type KnownChatErrorCode = (typeof KNOWN_CHAT_ERROR_CODES)[number];

export interface ChatErrorDescription {
  /** Short, distinct headline shown in the error banner. */
  title: string;
  /** One or two calm, honest sentences — never the raw server error. */
  description: string;
  /** Whether showing a "Try again" control makes sense for this code. */
  retryable: boolean;
}

const CHAT_ERROR_MESSAGES: Record<KnownChatErrorCode, ChatErrorDescription> = {
  rate_limited: {
    title: "Too many messages right now",
    description: "The chat is being rate-limited. Wait a moment, then try again.",
    retryable: true,
  },
  conversation_too_long: {
    title: "This conversation has run long",
    description: "Start a new conversation to keep chatting — this one has hit its length limit.",
    retryable: false,
  },
  timeout: {
    title: "That took too long",
    description: "The response timed out before it finished. Try again.",
    retryable: true,
  },
  upstream_error: {
    title: "The model provider had an error",
    description: "Something went wrong generating a response. Try again in a moment.",
    retryable: true,
  },
  unknown: {
    title: "Something went wrong",
    description: "An unexpected error occurred. Try again.",
    retryable: true,
  },
};

const FALLBACK_ERROR_DESCRIPTION: ChatErrorDescription = CHAT_ERROR_MESSAGES.unknown;

function isKnownChatErrorCode(value: unknown): value is KnownChatErrorCode {
  return typeof value === "string" && (KNOWN_CHAT_ERROR_CODES as readonly string[]).includes(value);
}

/** Maps any error code (known today or introduced later by #68) to UI copy, with a generic fallback. */
export function describeChatError(code: string): ChatErrorDescription {
  return isKnownChatErrorCode(code) ? CHAT_ERROR_MESSAGES[code] : FALLBACK_ERROR_DESCRIPTION;
}

export interface ParsedChatError {
  code: string;
  message: string;
}

/**
 * Recovers `{ code, message }` from a `useChat` error's `.message`, which
 * carries the raw `errorText` the server's `error` stream part wrote
 * (`stream-errors.ts#toStreamErrorEventText`). Never throws — text that
 * isn't the expected JSON shape (a raw `Error#message`, a network failure,
 * etc.) is treated as an `"unknown"` code rather than crashing the error
 * banner.
 */
export function parseChatErrorText(errorText: string): ParsedChatError {
  try {
    const parsed: unknown = JSON.parse(errorText);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      typeof (parsed as { code: unknown }).code === "string" &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
    ) {
      return {
        code: (parsed as { code: string }).code,
        message: (parsed as { message: string }).message,
      };
    }
  } catch {
    // Not JSON — fall through to the unknown-code default below.
  }
  return { code: "unknown", message: errorText };
}
