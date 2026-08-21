/**
 * Structured logging for `POST /api/chat` (#67).
 *
 * Every call is one JSON line to stdout — session id, latency, and
 * step/token counts when available. `ChatLogEvent`'s type is the entire
 * contract: it has no field for a message body, a transcript, or an API
 * key, so there is nothing for a future call site to accidentally pass
 * through. `CHAT_LOG_ALLOWED_KEYS` is exported so a test can assert the
 * emitted JSON never grows a key outside this list without that test
 * failing first.
 */

export type ChatLogEventName =
  | "chat_request_completed"
  | "chat_request_failed"
  | "chat_request_rejected";

export interface ChatLogEvent {
  event: ChatLogEventName;
  /** The client-generated session id (#67) — never a full transcript, just the correlation key. */
  sessionId: string;
  latencyMs: number;
  /** Number of agentic steps (tool-call round trips) taken, when known. */
  stepCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Set on `chat_request_failed` — the classified error code, never the raw provider error. */
  errorCode?: string;
}

/** The exhaustive set of keys {@link logChatEvent} may ever emit, plus the `ts` timestamp it adds. */
export const CHAT_LOG_ALLOWED_KEYS = [
  "ts",
  "event",
  "sessionId",
  "latencyMs",
  "stepCount",
  "inputTokens",
  "outputTokens",
  "errorCode",
] as const;

/** Emits one structured JSON line for a chat request outcome. Never logs message bodies or secrets. */
export function logChatEvent(entry: ChatLogEvent): void {
  const payload: Record<string, unknown> = { ts: new Date().toISOString() };
  for (const key of CHAT_LOG_ALLOWED_KEYS) {
    if (key === "ts") continue;
    const value = entry[key as keyof ChatLogEvent];
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  console.log(JSON.stringify(payload));
}
