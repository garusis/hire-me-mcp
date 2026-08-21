/**
 * The single, closed set of machine-readable error codes `POST /api/chat`
 * (#67, #68) can ever return — pre-stream (a plain JSON 4xx body, see
 * `validation-response.ts` and `rate-limit-response.ts`) or mid-stream (a
 * `type: "error"` UI message chunk, see `stream-errors.ts`).
 *
 * This is the shared seam #70 (the chat UI) is told about in the #68 issue
 * comment: every guardrail — request validation, per-session/per-IP rate
 * limiting, conversation-size caps, the per-turn step cap, tool-input
 * rejection, and the pre-existing provider-error classification (#67) —
 * returns one of these codes plus a short, fixed, UI-safe message. A caller
 * that only switches on `error.code` never needs to parse `error.message`.
 *
 * `CHAT_ERROR_MESSAGES` holds the DEFAULT message per code. Only
 * `invalid_request` is ever overridden (with a Zod field-level complaint,
 * still safe to render — see `validation-response.ts`); every other code's
 * message is fixed and never derived from the triggering input, so nothing
 * user-controlled can ever reach the client through an error payload.
 */

export type ChatErrorCode =
  // Request-shape validation (#67, tightened by #68's superRefine checks).
  | "invalid_request"
  // Rate limiting (#68) — shares the Upstash-backed sliding-window
  // mechanism #39 built for the MCP route, keyed by distinct namespaces.
  | "session_rate_limited"
  | "ip_rate_limited"
  // Conversation-size guardrails (#68), enforced in `request-schema.ts`.
  | "message_count_exceeded"
  | "message_size_exceeded"
  | "conversation_size_exceeded"
  // Per-turn agent step/tool-call cap (#68) — `agent-limits.ts`.
  | "step_limit_exceeded"
  // Tool-argument rejection (#68) — a tool call whose input failed its
  // strict Zod schema (#64) before the domain service ran.
  | "tool_input_rejected"
  // Pre-existing provider/model error classification (#67, `stream-errors.ts`).
  | "rate_limited"
  | "timeout"
  | "upstream_error"
  | "unknown";

/** Every {@link ChatErrorCode}, in the order documented above. Exported so a test can assert the set is exhaustive and stays deduplicated. */
export const CHAT_ERROR_CODES: readonly ChatErrorCode[] = [
  "invalid_request",
  "session_rate_limited",
  "ip_rate_limited",
  "message_count_exceeded",
  "message_size_exceeded",
  "conversation_size_exceeded",
  "step_limit_exceeded",
  "tool_input_rejected",
  "rate_limited",
  "timeout",
  "upstream_error",
  "unknown",
];

/** Fixed, short, UI-safe default message per {@link ChatErrorCode}. */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  invalid_request: "That request wasn't valid.",
  session_rate_limited: "You've hit the message limit for this session. Please wait and try again.",
  ip_rate_limited: "Too many requests from this network right now. Please wait and try again.",
  message_count_exceeded: "This conversation has reached its maximum number of messages.",
  message_size_exceeded: "That message is too long.",
  conversation_size_exceeded: "This conversation has reached its maximum total size.",
  step_limit_exceeded: "This turn needed too many steps and was stopped.",
  tool_input_rejected: "That request couldn't be processed.",
  rate_limited: "The model provider is rate-limiting requests right now. Please try again shortly.",
  timeout: "The request to the model provider timed out.",
  upstream_error: "The model provider returned an error.",
  unknown: "An unexpected error occurred while generating a response.",
};

/** A typed error payload for {@link ChatErrorCode} — the shape every #68 guardrail response body shares. */
export interface ChatErrorPayload {
  error: {
    code: ChatErrorCode;
    message: string;
  };
}

/** Builds a {@link ChatErrorPayload}. `message` defaults to the code's fixed copy; pass an override only for `invalid_request`'s Zod field-level complaint. */
export function buildChatErrorPayload(code: ChatErrorCode, message?: string): ChatErrorPayload {
  return { error: { code, message: message ?? CHAT_ERROR_MESSAGES[code] } };
}
