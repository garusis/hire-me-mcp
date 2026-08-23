/**
 * `GET /api/stats` (#81) handler logic — split out from `route.ts` for the
 * same test-injection-seam reason `app/api/cron/analytics-retention/handler.ts`
 * is: `createStatsRouteHandler` lives here, `route.ts` re-exports only
 * `GET = createStatsRouteHandler()`.
 *
 * Renders the private, aggregate-only usage view over the retention
 * window (`@hire-me-mcp/core/analytics`'s `getUsageStats`, windowed by the
 * same `RETENTION_WINDOW_DAYS` constant the retention job and the public
 * privacy note both read from) — tool-call counts by tool and surface,
 * outcome mix, and question-theme frequency. Nothing else: no raw text, no
 * per-visitor rows, ever, because the underlying tables store nothing else
 * (see `packages/core/src/analytics/taxonomy.ts`).
 *
 * ## Auth (owner decision, issue #81, 2026-08-23)
 *
 * Structurally mirrors the `CRON_SECRET` bearer-check pattern from
 * `app/api/cron/analytics-retention/handler.ts` — an injectable-options
 * seam, a small `isAuthorized` predicate — but diverges in two ways,
 * both deliberate:
 *
 * 1. **Transport**: a `?token=` query-string parameter, not an
 *    `Authorization` header. The cron route is invoked by Vercel's own
 *    signer, which can set arbitrary headers; this route is meant to be
 *    opened directly in a browser by a human, who can't attach a custom
 *    header to a URL bar navigation.
 * 2. **Fail-closed, not fail-open**: the cron route treats an *unset*
 *    `CRON_SECRET` as authorized (nothing sensitive to leak from a sweep
 *    job). This route treats "not configured" and "wrong token"
 *    identically — a 404, never a 401 — so a request can never distinguish
 *    "this route doesn't exist," "the secret isn't set," and "the token is
 *    wrong." Nothing about the route's existence or configuration leaks.
 */

import { getUsageStats, RETENTION_WINDOW_DAYS, type UsageStats } from "@hire-me-mcp/core/analytics";
import { createDbClient, type DbClient, loadDbConfig } from "@hire-me-mcp/core/db";

/** Options for {@link createStatsRouteHandler} — test-injection seam, mirrors the cron handler's `RetentionCronOptions`. */
export interface StatsRouteOptions {
  /** Expected token — defaults to `process.env.STATS_SECRET`. `undefined` means "not configured," which (unlike the cron route) is treated as unauthorized. */
  statsSecret?: string;
  /** Clock — defaults to the real one. Test seam for asserting the exact stats window used. */
  now?: () => Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function notFound(): Response {
  // Deliberately minimal, identical for every failure mode (missing
  // token, wrong token, unconfigured secret, DB unavailable) — see the
  // module doc's "fail-closed" note.
  return new Response("Not found", { status: 404 });
}

function isAuthorized(request: Request, statsSecret: string | undefined): boolean {
  if (!statsSecret) return false;
  const token = new URL(request.url).searchParams.get("token");
  return token === statsSecret;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCountRows(rows: ReadonlyArray<{ label: string; count: number }>): string {
  if (rows.length === 0) return "<p>No events in this window.</p>";
  const items = rows
    .map((row) => `<li>${escapeHtml(row.label)}: <strong>${row.count}</strong></li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

/** Renders the private stats view as a minimal, self-contained HTML fragment — aggregates only, see module doc. */
function renderStatsPage(stats: UsageStats): string {
  const toolRows = stats.toolCounts.map((row) => ({
    label: `${row.toolName} (${row.surface})`,
    count: row.count,
  }));
  const surfaceRows = stats.surfaceCounts.map((row) => ({ label: row.surface, count: row.count }));
  const outcomeRows = stats.outcomeCounts.map((row) => ({ label: row.outcome, count: row.count }));
  const themeRows = stats.themeCounts.map((row) => ({ label: row.theme, count: row.count }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<title>Usage stats (private)</title>
</head>
<body>
<h1>Usage stats (private)</h1>
<p>Window: ${stats.since.toISOString()} — ${stats.until.toISOString()}</p>
<p>Total tool events: <strong>${stats.totalToolEvents}</strong>. Total chat questions: <strong>${stats.totalQuestionEvents}</strong>.</p>
<h2>Tool calls by tool</h2>
${renderCountRows(toolRows)}
<h2>By surface</h2>
${renderCountRows(surfaceRows)}
<h2>Outcome mix</h2>
${renderCountRows(outcomeRows)}
<h2>Question themes</h2>
${renderCountRows(themeRows)}
</body>
</html>`;
}

/** Builds the `GET` handler. `options.statsSecret`/`options.now` default to `process.env.STATS_SECRET`/the real clock — tests inject both. */
export function createStatsRouteHandler(options: StatsRouteOptions = {}) {
  const statsSecret = "statsSecret" in options ? options.statsSecret : process.env.STATS_SECRET;
  const now = options.now ?? (() => new Date());

  return async function GET(request: Request): Promise<Response> {
    if (!isAuthorized(request, statsSecret)) {
      return notFound();
    }

    let dbClient: DbClient;
    try {
      dbClient = createDbClient(loadDbConfig());
    } catch (error) {
      console.error("[stats] DATABASE_URL is not configured", error);
      return notFound();
    }

    try {
      const until = now();
      const since = new Date(until.getTime() - RETENTION_WINDOW_DAYS * MS_PER_DAY);
      const stats = await getUsageStats(dbClient.sql, { since, until });
      return new Response(renderStatsPage(stats), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    } catch (error) {
      console.error("[stats] usage stats query failed", error);
      return notFound();
    } finally {
      await dbClient.close().catch(() => undefined);
    }
  };
}
