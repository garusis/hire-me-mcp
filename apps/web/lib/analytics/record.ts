/**
 * Convenience, always-safe wrappers over `@hire-me-mcp/core/analytics`'s
 * `recordToolEvent`/`recordQuestionEvent` (#79) — the functions the MCP
 * adapter layer, the chat pipeline, and the rate-limit wrapper actually
 * call. Each one:
 *
 * 1. Resolves the memoized store via `getAnalyticsStore()` — never throws,
 *    returns `undefined` if analytics isn't configured (see that module).
 * 2. If there's no store, returns immediately — nothing to record.
 * 3. Otherwise delegates to the core module's fire-and-forget recorder,
 *    which itself never awaits the write or lets a failure propagate.
 *
 * This is the ONE place a call site needs to import from — it never has
 * to know about `AnalyticsStore`, scrubbing, or the store singleton.
 */

import {
  recordQuestionEvent as coreRecordQuestionEvent,
  recordToolEvent as coreRecordToolEvent,
  type QuestionTheme,
  type ToolOutcome,
} from "@hire-me-mcp/core/analytics";
import { getAnalyticsStore } from "./get-analytics-store";

function logStoreResolutionFailure(error: unknown): void {
  console.error("[analytics] getAnalyticsStore() threw — the event was not recorded", error);
}

/** Records a `surface: "mcp"` tool event — called from the shared MCP adapter layer for every tool call. */
export function recordMcpToolEvent(
  toolName: string,
  outcome: ToolOutcome,
  latencyMs: number,
): void {
  try {
    const store = getAnalyticsStore();
    if (!store) return;
    coreRecordToolEvent(store, { surface: "mcp", toolName, outcome, latencyMs });
  } catch (error) {
    logStoreResolutionFailure(error);
  }
}

/** Records a `surface: "chat"` tool event — called for the chat pipeline itself and for each tool the chat agent invokes. */
export function recordChatToolEvent(
  toolName: string,
  outcome: ToolOutcome,
  latencyMs: number,
): void {
  try {
    const store = getAnalyticsStore();
    if (!store) return;
    coreRecordToolEvent(store, { surface: "chat", toolName, outcome, latencyMs });
  } catch (error) {
    logStoreResolutionFailure(error);
  }
}

/** Records one chat-question event — called once per chat turn that reaches the agent. */
export function recordChatQuestionEvent(
  theme: QuestionTheme,
  latencyMs: number,
  usedRetrieval: boolean,
): void {
  try {
    const store = getAnalyticsStore();
    if (!store) return;
    coreRecordQuestionEvent(store, { theme, latencyMs, usedRetrieval });
  } catch (error) {
    logStoreResolutionFailure(error);
  }
}
