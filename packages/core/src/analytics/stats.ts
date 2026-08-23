/**
 * Read-only aggregation queries over `analytics_tool_events` and
 * `analytics_question_events` (#79) for the private stats route (#81) —
 * counts by tool, by surface, by outcome, and question-theme frequency
 * over a caller-selected time range. Every result here is a GROUP BY
 * count: no raw row, no per-visitor data, can ever come back from this
 * module, by construction, because the tables themselves store nothing
 * else (see `taxonomy.ts` and `scrubber.ts`).
 *
 * Lives in `packages/core` (not `apps/web`) for the same reason
 * `analytics-repository.ts` does: it's a typed query surface over the
 * shared `postgres` `Sql` client, framework-free, usable from any future
 * consumer of `@hire-me-mcp/core/analytics`.
 */

import type { Sql } from "postgres";
import type { AnalyticsSurface, QuestionTheme, ToolOutcome } from "./taxonomy.js";

export interface ToolCountRow {
  surface: AnalyticsSurface;
  toolName: string;
  count: number;
}

export interface SurfaceCountRow {
  surface: AnalyticsSurface;
  count: number;
}

export interface OutcomeCountRow {
  outcome: ToolOutcome;
  count: number;
}

export interface ThemeCountRow {
  theme: QuestionTheme;
  count: number;
}

/** Aggregates over `[since, until)` — every field is a count, nothing else. */
export interface UsageStats {
  since: Date;
  until: Date;
  toolCounts: ToolCountRow[];
  surfaceCounts: SurfaceCountRow[];
  outcomeCounts: OutcomeCountRow[];
  themeCounts: ThemeCountRow[];
  totalToolEvents: number;
  totalQuestionEvents: number;
}

export interface UsageStatsRange {
  since: Date;
  /** Defaults to the real current time — the range is `[since, until)`. */
  until?: Date;
}

/** Parses postgres.js's `count`/`bigint` aggregate results (returned as strings) to a `number`. Safe here: event counts over a 90-day retention window never approach `Number.MAX_SAFE_INTEGER`. */
function toCount(value: unknown): number {
  return typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
}

/**
 * Runs the grouped aggregation queries for the private stats route and
 * assembles them into one {@link UsageStats} snapshot. Every query is
 * `WHERE created_at >= since AND created_at < until` — no other filter,
 * no free-form input reaches SQL.
 */
export async function getUsageStats(sql: Sql, range: UsageStatsRange): Promise<UsageStats> {
  const since = range.since;
  const until = range.until ?? new Date();

  const [toolCountRows, surfaceCountRows, outcomeCountRows, themeCountRows, totalsRows] =
    await Promise.all([
      sql`
        SELECT surface, tool_name, COUNT(*) AS count
        FROM analytics_tool_events
        WHERE created_at >= ${since} AND created_at < ${until}
        GROUP BY surface, tool_name
        ORDER BY count DESC, tool_name ASC
      `,
      sql`
        SELECT surface, COUNT(*) AS count
        FROM analytics_tool_events
        WHERE created_at >= ${since} AND created_at < ${until}
        GROUP BY surface
        ORDER BY count DESC
      `,
      sql`
        SELECT outcome, COUNT(*) AS count
        FROM analytics_tool_events
        WHERE created_at >= ${since} AND created_at < ${until}
        GROUP BY outcome
        ORDER BY count DESC
      `,
      sql`
        SELECT theme, COUNT(*) AS count
        FROM analytics_question_events
        WHERE created_at >= ${since} AND created_at < ${until}
        GROUP BY theme
        ORDER BY count DESC
      `,
      sql`
        SELECT
          (SELECT COUNT(*) FROM analytics_tool_events WHERE created_at >= ${since} AND created_at < ${until}) AS tool_total,
          (SELECT COUNT(*) FROM analytics_question_events WHERE created_at >= ${since} AND created_at < ${until}) AS question_total
      `,
    ]);

  const totals = totalsRows[0] as unknown as
    | { tool_total?: unknown; question_total?: unknown }
    | undefined;

  return {
    since,
    until,
    toolCounts: (
      toolCountRows as unknown as Array<{
        surface: AnalyticsSurface;
        tool_name: string;
        count: unknown;
      }>
    ).map((row) => ({ surface: row.surface, toolName: row.tool_name, count: toCount(row.count) })),
    surfaceCounts: (
      surfaceCountRows as unknown as Array<{ surface: AnalyticsSurface; count: unknown }>
    ).map((row) => ({ surface: row.surface, count: toCount(row.count) })),
    outcomeCounts: (
      outcomeCountRows as unknown as Array<{ outcome: ToolOutcome; count: unknown }>
    ).map((row) => ({ outcome: row.outcome, count: toCount(row.count) })),
    themeCounts: (themeCountRows as unknown as Array<{ theme: QuestionTheme; count: unknown }>).map(
      (row) => ({
        theme: row.theme,
        count: toCount(row.count),
      }),
    ),
    totalToolEvents: toCount(totals?.tool_total ?? 0),
    totalQuestionEvents: toCount(totals?.question_total ?? 0),
  };
}
