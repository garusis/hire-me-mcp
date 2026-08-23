/**
 * The `AnalyticsStore` seam (#79) and the fire-and-forget helpers every
 * instrumentation call site (the MCP adapter layer, the chat pipeline —
 * both in `apps/web`) uses instead of calling the repository directly.
 *
 * The whole point of this module: recording an event must NEVER fail or
 * measurably delay the request path it's attached to. `recordToolEvent`/
 * `recordQuestionEvent` below are synchronous functions that kick off the
 * store write and immediately return — they do not `await` it, and any
 * rejection (a scrub failure, a dropped connection, a cold Neon branch) is
 * caught and logged, never re-thrown, never propagated to the caller's
 * caller.
 */

import type { Sql } from "postgres";
import { insertQuestionEvent, insertToolEvent } from "./analytics-repository.js";
import type { QuestionEventInput, ToolEventInput } from "./scrubber.js";

/** The minimal write surface instrumentation call sites depend on — real Postgres in production, a fake/throwing store in tests. */
export interface AnalyticsStore {
  recordToolEvent(event: ToolEventInput): Promise<void>;
  recordQuestionEvent(event: QuestionEventInput): Promise<void>;
}

/** Builds an {@link AnalyticsStore} backed by the real Postgres repository. */
export function createPostgresAnalyticsStore(sql: Sql): AnalyticsStore {
  return {
    recordToolEvent: (event) => insertToolEvent(sql, event),
    recordQuestionEvent: (event) => insertQuestionEvent(sql, event),
  };
}

/** Default error handler: logs to stderr, never throws. Overridable per call for tests that want to observe the failure. */
function defaultOnError(context: string, error: unknown): void {
  console.error(`[analytics] failed to record ${context} — request path was not affected`, error);
}

/**
 * Fire-and-forget: starts `store.recordToolEvent(event)` and returns
 * immediately without awaiting it. A rejection (thrown store, scrub
 * failure, network error) is caught and passed to `onError` — it never
 * becomes an unhandled rejection and never propagates to this function's
 * caller.
 */
export function recordToolEvent(
  store: AnalyticsStore,
  event: ToolEventInput,
  onError: (error: unknown) => void = (error) => defaultOnError("a tool event", error),
): void {
  try {
    void store.recordToolEvent(event).catch(onError);
  } catch (error) {
    // Guards a store whose method itself throws synchronously (rather than
    // returning a rejected promise) — same non-propagating contract either way.
    onError(error);
  }
}

/** The question-event counterpart to {@link recordToolEvent} — same fire-and-forget contract. */
export function recordQuestionEvent(
  store: AnalyticsStore,
  event: QuestionEventInput,
  onError: (error: unknown) => void = (error) => defaultOnError("a question event", error),
): void {
  try {
    void store.recordQuestionEvent(event).catch(onError);
  } catch (error) {
    onError(error);
  }
}
