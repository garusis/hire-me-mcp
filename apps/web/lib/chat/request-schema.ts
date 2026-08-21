/**
 * Strict, bounded request schema for `POST /api/chat` (#67).
 *
 * This is deliberately *basic hygiene* only — a hard ceiling on how many
 * messages a single request can carry and how long any one text part can
 * be, so a malformed or abusive payload never reaches the agent. The full
 * guardrail budget (per-session rate limiting, conversation-length policy,
 * prompt-injection hardening) is the dedicated task in this epic (#68) and
 * is explicitly out of scope here.
 *
 * Message shape mirrors the AI SDK v7 `UIMessage` the client's `useChat`
 * transport sends (`{ id, role, parts }`) closely enough to pass straight
 * through to `agent.stream()` — Mastra's `MessageListInput` accepts AI SDK
 * v5/v6/v7 `UIMessage` objects natively (see `packages/agent`'s
 * `@mastra/core` dependency), so no shape translation happens in the route.
 * Only the `text` part type is accepted: the interview agent doesn't consume
 * file/image parts today, and accepting-then-ignoring them would be a silent
 * behavior gap rather than a validation error.
 */

import { z } from "zod";

/** Bounds enforced by {@link chatRequestSchema}. Exported so tests can probe the edges precisely. */
export const CHAT_MESSAGE_LIMITS = {
  /** Max messages (history + new turn) accepted in a single request body. */
  maxMessages: 50,
  /** Max text parts a single message may carry. */
  maxPartsPerMessage: 20,
  /** Max characters in a single text part. */
  maxTextLength: 8_000,
  /**
   * Max total characters across every text part of every message in one
   * request (#68) — a conversation-level cost/abuse ceiling independent of
   * the per-message `maxTextLength` above: a caller could otherwise stay
   * under the per-message limit while still growing an unbounded
   * conversation transcript one message at a time. 40,000 characters is
   * roughly 50 turns' worth of average chat-length messages (~800 chars
   * each) — generous for a genuine back-and-forth about the candidate's
   * background, tight enough to bound per-conversation model-provider cost
   * on a portfolio demo funded out of pocket.
   */
  maxConversationChars: 40_000,
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const chatTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(CHAT_MESSAGE_LIMITS.maxTextLength),
});

const chatMessageSchema = z.object({
  // Required, not optional: the AI SDK v7 `UIMessage` shape this is meant
  // to pass through to `agent.stream()` unmodified (see `route.ts`)
  // requires `id` — the client's `useChat` transport always sends one.
  id: z.string().min(1).max(200),
  // "system" is deliberately excluded (#68 instruction-hierarchy
  // hardening): the system prompt is set exclusively via the agent's own
  // `instructions` (`packages/agent/src/interview-agent.ts`), never by a
  // client-supplied message. Accepting `role: "system"` here would let any
  // caller inject a message Mastra/the model treats as system-level —
  // outranking the redirect policy this schema is meant to protect —
  // instead of ordinary, lower-trust visitor text.
  role: z.enum(["user", "assistant"]),
  parts: z.array(chatTextPartSchema).min(1).max(CHAT_MESSAGE_LIMITS.maxPartsPerMessage),
});

/**
 * The full `POST /api/chat` request body. `sessionId` is a client-generated
 * UUID (see `route.ts` for the documented client-generated-vs-server-issued
 * decision) — required on every request so per-session rate limiting (#68)
 * and analytics (#8) have a stable key from day one.
 */
export const chatRequestSchema = z
  .object({
    sessionId: z.string().regex(UUID_PATTERN, "sessionId must be a UUID"),
    messages: z.array(chatMessageSchema).min(1).max(CHAT_MESSAGE_LIMITS.maxMessages),
  })
  // Conversation-total character cap (#68) — cannot be expressed as a
  // per-field `.max()`, so it's a custom issue carrying a `chatErrorCode`
  // param. `classifyValidationError` (`validation-response.ts`) reads that
  // param to return the distinct `conversation_size_exceeded` code instead
  // of the generic `invalid_request` every other structural issue maps to.
  .superRefine((body, ctx) => {
    const totalChars = body.messages.reduce(
      (sum, message) =>
        sum + message.parts.reduce((partSum, part) => partSum + part.text.length, 0),
      0,
    );
    if (totalChars > CHAT_MESSAGE_LIMITS.maxConversationChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: `Conversation exceeds the ${CHAT_MESSAGE_LIMITS.maxConversationChars}-character total limit.`,
        params: { chatErrorCode: "conversation_size_exceeded" },
      });
    }
  });

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
export type ChatRequestMessage = z.infer<typeof chatMessageSchema>;
