/**
 * Client-side request sanitizer for `POST /api/chat` (issue 222).
 *
 * The AI SDK v7 `useChat` history replays every part of every prior turn —
 * including the assistant turn's `step-start` and `tool-*` parts — but the
 * endpoint's request schema (`apps/web/lib/chat/request-schema.ts`)
 * deliberately accepts ONLY `type: "text"` parts (the agent re-derives its
 * own tool state each turn; accepting-then-ignoring non-text parts
 * server-side would be a silent behavior gap). Before this sanitizer
 * existed, the widget's `prepareSendMessagesRequest` passed the raw
 * `UIMessage[]` straight through, so the SECOND message of every
 * conversation was rejected with HTTP 400 `invalid_request` — the chat was
 * effectively single-turn.
 *
 * The fix lives here, at the client/transport boundary, rather than by
 * loosening the server schema: the server's strict text-only contract is a
 * documented guardrail decision (#67/#68), and the tool/step parts carry
 * nothing the agent needs — the assistant's visible text is the whole
 * conversational record the next turn requires.
 */

import type { UIMessage } from "ai";

/** The wire shape `chatRequestSchema` accepts: text parts only. */
export interface ChatRequestWireMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}

/**
 * Projects `useChat`'s `UIMessage[]` onto the endpoint's text-only wire
 * shape: keeps only non-empty `text` parts, and drops any message left
 * with no text at all (e.g. an assistant turn that only ever produced
 * tool calls, or a `system` message — the schema rejects both `system`
 * roles and empty part lists).
 */
export function toRequestMessages(messages: readonly UIMessage[]): ChatRequestWireMessage[] {
  const wireMessages: ChatRequestWireMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }
    const parts = message.parts
      .filter(
        (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
          part.type === "text" && typeof part.text === "string" && part.text.length > 0,
      )
      .map((part) => ({ type: "text" as const, text: part.text }));
    if (parts.length === 0) {
      continue;
    }
    wireMessages.push({ id: message.id, role: message.role, parts });
  }
  return wireMessages;
}
