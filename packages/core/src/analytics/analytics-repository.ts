/**
 * Typed repository over `analytics_tool_events` and `analytics_question_events`
 * (#79, migration `003_add_analytics_events`) — the ONLY module in this
 * codebase allowed to write to or delete from either table, mirroring
 * `db/chunks-repository.ts`'s "repository is the seam" convention.
 *
 * Every insert runs the event through `scrubber.ts` first — an event that
 * fails scrubbing never reaches the database; the promise rejects instead.
 * This keeps the guarantee "nothing unscrubbed can be persisted" true even
 * if a future call site forgets to scrub before calling this module.
 */

import type { Sql } from "postgres";
import {
  type QuestionEventInput,
  scrubQuestionEvent,
  scrubToolEvent,
  type ToolEventInput,
} from "./scrubber.js";
import { bucketLatencyMs } from "./taxonomy.js";

/** Inserts one scrubbed tool-call event. Rejects, without writing anything, if `event` fails scrubbing. */
export async function insertToolEvent(sql: Sql, event: ToolEventInput): Promise<void> {
  const scrubbed = scrubToolEvent(event);
  const bucket = bucketLatencyMs(scrubbed.latencyMs);
  await sql`
    INSERT INTO analytics_tool_events (surface, tool_name, outcome, latency_bucket)
    VALUES (${scrubbed.surface}, ${scrubbed.toolName}, ${scrubbed.outcome}, ${bucket})
  `;
}

/** Inserts one scrubbed chat-question event. Rejects, without writing anything, if `event` fails scrubbing. */
export async function insertQuestionEvent(sql: Sql, event: QuestionEventInput): Promise<void> {
  const scrubbed = scrubQuestionEvent(event);
  const bucket = bucketLatencyMs(scrubbed.latencyMs);
  await sql`
    INSERT INTO analytics_question_events (theme, latency_bucket, used_retrieval)
    VALUES (${scrubbed.theme}, ${bucket}, ${scrubbed.usedRetrieval})
  `;
}

/** Row-count result of a retention sweep — see `retention.ts`. */
export interface DeleteExpiredResult {
  deletedToolEvents: number;
  deletedQuestionEvents: number;
}

/** Returns the affected-row count of a postgres.js query result, or 0 if unavailable (e.g. a test fake). */
function affectedCount(result: unknown): number {
  const count = (result as { count?: number } | undefined)?.count;
  return typeof count === "number" ? count : 0;
}

/**
 * Deletes every row in both analytics tables with `created_at` strictly
 * before `cutoff` — the retention job's (`retention.ts`) only write path.
 * Rows at or after `cutoff` are left untouched.
 */
export async function deleteExpiredAnalyticsEvents(
  sql: Sql,
  cutoff: Date,
): Promise<DeleteExpiredResult> {
  const toolResult = await sql`
    DELETE FROM analytics_tool_events WHERE created_at < ${cutoff}
  `;
  const questionResult = await sql`
    DELETE FROM analytics_question_events WHERE created_at < ${cutoff}
  `;
  return {
    deletedToolEvents: affectedCount(toolResult),
    deletedQuestionEvents: affectedCount(questionResult),
  };
}

/**
 * Test-only: truncates both analytics tables. Mirrors
 * `db/reset-career-chunks.ts`'s `resetCareerChunks` — used by integration
 * test setup against a throwaway Neon branch, which forks from the real,
 * already-migrated, non-empty default branch and so needs an explicit
 * reset before each suite seeds its own fixtures.
 */
export async function resetAnalyticsEvents(sql: Sql): Promise<void> {
  await sql`TRUNCATE TABLE analytics_tool_events RESTART IDENTITY`;
  await sql`TRUNCATE TABLE analytics_question_events RESTART IDENTITY`;
}
