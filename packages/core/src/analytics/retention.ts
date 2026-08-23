/**
 * The retention policy for anonymized usage analytics (#79): a single
 * exported window constant, and a pure cutoff/job pair driven by an
 * injectable clock so both are deterministic to test.
 *
 * {@link RETENTION_WINDOW_DAYS} is the ONE place this window is defined —
 * the scheduled deletion job (this module), the README's documented
 * retention window, and the public privacy note (a later task in epic #8)
 * all read from this constant so they cannot drift out of sync with each
 * other.
 *
 * 90 days: long enough to see monthly-ish usage trends (which tools get
 * called, which question themes recur) across a full quarter, short
 * enough that this pipeline never becomes a long-term store of anything —
 * consistent with the "generalize, don't retain forever" spirit of the
 * rest of this schema.
 */

import type { Sql } from "postgres";
import { type DeleteExpiredResult, deleteExpiredAnalyticsEvents } from "./analytics-repository.js";

/** The single source of truth for how long an analytics event row survives. Keep docs and code from disagreeing by only ever reading this constant. */
export const RETENTION_WINDOW_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The cutoff timestamp: rows strictly older than this are eligible for deletion. `now` defaults to the real clock; tests inject a fixed one. */
export function computeRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETENTION_WINDOW_DAYS * MS_PER_DAY);
}

/**
 * Runs one retention sweep: deletes every analytics event row older than
 * {@link RETENTION_WINDOW_DAYS} relative to `now`, leaving newer rows
 * untouched. This is the only function the cron route (`apps/web`) calls.
 */
export async function runRetentionJob(
  sql: Sql,
  now: Date = new Date(),
): Promise<DeleteExpiredResult> {
  const cutoff = computeRetentionCutoff(now);
  return deleteExpiredAnalyticsEvents(sql, cutoff);
}
