/**
 * `GET /api/cron/analytics-retention` (#79) handler logic — split out from
 * `route.ts` for the same reason `app/api/chat/handler.ts` is: Next.js's
 * App Router only allows a closed set of recognized route-module exports,
 * so the test-injection seam (`createRetentionCronHandler`) lives here and
 * `route.ts` re-exports only `GET = createRetentionCronHandler()`.
 *
 * Runs the retention job (`@hire-me-mcp/core/analytics`'s `runRetentionJob`,
 * driven by the single exported `RETENTION_WINDOW_DAYS` constant) against
 * the real Neon Postgres database, scheduled via `apps/web/vercel.json`'s
 * `crons` entry.
 *
 * ## Auth
 *
 * Vercel signs its own cron invocations with `Authorization: Bearer
 * $CRON_SECRET` (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * `CRON_SECRET` must be set in Vercel Project Settings for Preview and
 * Production. If it isn't set (local dev, a fresh checkout without the
 * env var), the route treats every request as authorized rather than
 * locking itself out — same "not configured" != "misconfigured" stance
 * `apps/web/lib/analytics/get-analytics-store.ts` takes for `DATABASE_URL`.
 *
 * ## Failure handling
 *
 * Unlike the fire-and-forget recorder path, THIS route's whole job is to
 * do the delete — a failure here is reported (500, logged), not silently
 * swallowed, since there's no request-path latency to protect and a
 * failed sweep should be visible in the Vercel cron's own run history.
 */

import { runRetentionJob } from "@hire-me-mcp/core/analytics";
import { createDbClient, type DbClient, loadDbConfig } from "@hire-me-mcp/core/db";

/** Options for {@link createRetentionCronHandler} — test-injection seam, mirrors `handler.ts`'s `ChatRouteOptions`. */
export interface RetentionCronOptions {
  /** Expected bearer token — defaults to `process.env.CRON_SECRET`. `undefined` means "not configured" (see module docs). */
  cronSecret?: string;
  /** Clock — defaults to the real one. Test seam for asserting the exact retention cutoff used. */
  now?: () => Date;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isAuthorized(request: Request, cronSecret: string | undefined): boolean {
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** Builds the `GET` handler. `options.cronSecret`/`options.now` default to `process.env.CRON_SECRET`/the real clock — tests inject both. */
export function createRetentionCronHandler(options: RetentionCronOptions = {}) {
  const cronSecret = "cronSecret" in options ? options.cronSecret : process.env.CRON_SECRET;
  const now = options.now ?? (() => new Date());

  return async function GET(request: Request): Promise<Response> {
    if (!isAuthorized(request, cronSecret)) {
      return jsonResponse(401, { error: "unauthorized" });
    }

    let dbClient: DbClient;
    try {
      dbClient = createDbClient(loadDbConfig());
    } catch (error) {
      console.error("[analytics-retention] DATABASE_URL is not configured", error);
      return jsonResponse(500, { error: "database_not_configured" });
    }

    try {
      const result = await runRetentionJob(dbClient.sql, now());
      return jsonResponse(200, {
        deletedToolEvents: result.deletedToolEvents,
        deletedQuestionEvents: result.deletedQuestionEvents,
      });
    } catch (error) {
      console.error("[analytics-retention] retention job failed", error);
      return jsonResponse(500, { error: "retention_job_failed" });
    } finally {
      await dbClient.close().catch(() => undefined);
    }
  };
}
