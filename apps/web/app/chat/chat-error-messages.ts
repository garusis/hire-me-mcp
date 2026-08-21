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
 * The guardrails task (#68) owns the server-side code set
 * (`../../lib/chat/error-codes.ts`'s `ChatErrorCode`) and `describeChatError`
 * is written generically against it changing further: known codes get
 * tailored copy, `KNOWN_CHAT_ERROR_CODES` documents the ones this UI has
 * bespoke copy for today, and anything else — including a code introduced
 * after this file was last updated — falls back to
 * `FALLBACK_ERROR_DESCRIPTION` rather than failing to render or blocking on
 * a follow-up UI change.
 *
 * **#73 fix**: this file predated #68 landing its real guardrail codes
 * (`session_rate_limited`, `ip_rate_limited`, `message_count_exceeded`,
 * `message_size_exceeded`, `conversation_size_exceeded`,
 * `step_limit_exceeded`, `tool_input_rejected`) and still only listed a
 * placeholder `conversation_too_long` that the server never actually emits
 * — every real guardrail response silently fell through to the generic
 * fallback in the UI instead of its own honest, specific message. Found
 * while building #73's guardrail-visibility Playwright spec (which needed
 * to assert a SPECIFIC honest message, not just "some banner appeared").
 * Fixed here by adding the real codes; `conversation_too_long` is kept too
 * (harmless — no code currently emits it, but removing it isn't this fix's
 * job and it costs nothing to keep recognized).
 */

/** Error codes this UI has bespoke copy for. Mirrors `../../lib/chat/error-codes.ts`'s `ChatErrorCode` (the server's real, closed guardrail code set), plus the legacy `conversation_too_long` placeholder (kept for compatibility; no code currently emits it). */
export const KNOWN_CHAT_ERROR_CODES = [
  "invalid_request",
  "session_rate_limited",
  "ip_rate_limited",
  "message_count_exceeded",
  "message_size_exceeded",
  "conversation_size_exceeded",
  "step_limit_exceeded",
  "tool_input_rejected",
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
  invalid_request: {
    title: "That message couldn't be sent",
    description: "The request wasn't valid. Try rephrasing and sending it again.",
    retryable: true,
  },
  session_rate_limited: {
    title: "Message limit reached for this session",
    description: "You've hit the message limit for this session. Wait a moment, then try again.",
    retryable: true,
  },
  ip_rate_limited: {
    title: "Too many requests right now",
    description: "Too many requests from this network right now. Wait a moment, then try again.",
    retryable: true,
  },
  message_count_exceeded: {
    title: "This conversation has run long",
    description:
      "This conversation has reached its maximum number of messages. Start a new conversation to keep chatting.",
    retryable: false,
  },
  message_size_exceeded: {
    title: "That message is too long",
    description: "Try sending a shorter message.",
    retryable: true,
  },
  conversation_size_exceeded: {
    title: "This conversation has run long",
    description:
      "This conversation has reached its maximum total size. Start a new conversation to keep chatting.",
    retryable: false,
  },
  step_limit_exceeded: {
    title: "That turn needed too many steps",
    description:
      "This turn needed too many steps and was stopped. Try asking a more specific question.",
    retryable: true,
  },
  tool_input_rejected: {
    title: "That request couldn't be processed",
    description: "Try rephrasing your question.",
    retryable: true,
  },
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

function readFlatCodeMessage(value: unknown): ParsedChatError | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  ) {
    return {
      code: (value as { code: string }).code,
      message: (value as { message: string }).message,
    };
  }
  return null;
}

/**
 * Recovers `{ code, message }` from a `useChat` error's `.message`. Two
 * shapes are recognized, both produced server-side by `apps/web/lib/chat/`:
 *
 * - The flat `{ code, message }` shape `stream-errors.ts#toStreamErrorEventText`
 *   writes into the stream's `error` part for a mid-turn failure.
 * - The nested `{ error: { code, message } }` shape `error-codes.ts#buildChatErrorPayload`
 *   produces for a pre-stream 4xx (rate limiting, request validation — #68),
 *   which the AI SDK transport surfaces as the raw, unparsed response body
 *   text (see `HttpChatTransport`'s `!response.ok` branch) — added for #73
 *   after finding every pre-stream guardrail response fell through to the
 *   "unknown" branch below without this unwrap.
 *
 * Never throws — text that isn't either expected JSON shape (a raw
 * `Error#message`, a network failure, etc.) is treated as an `"unknown"`
 * code rather than crashing the error banner.
 */
export function parseChatErrorText(errorText: string): ParsedChatError {
  try {
    const parsed: unknown = JSON.parse(errorText);
    const flat = readFlatCodeMessage(parsed);
    if (flat) {
      return flat;
    }
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const nested = readFlatCodeMessage((parsed as { error: unknown }).error);
      if (nested) {
        return nested;
      }
    }
  } catch {
    // Not JSON — fall through to the unknown-code default below.
  }
  return { code: "unknown", message: errorText };
}
