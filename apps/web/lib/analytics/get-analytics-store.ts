/**
 * The single, memoized `AnalyticsStore` (#79) every instrumentation call
 * site — the MCP adapter layer, the chat pipeline, the rate-limit wrapper —
 * records through. Mirrors `lib/mcp/search-career-instance.ts`'s
 * lazy-construct-once-per-warm-Lambda pattern, applied to a store instead
 * of a `SearchCareer` function.
 *
 * Unlike `getSearchCareer()`, this module never throws: a missing
 * `DATABASE_URL` (local dev without a database, a test run, a broken
 * deploy) must not crash a tool call or a chat answer just because
 * analytics can't be recorded. `getAnalyticsStore()` returns `undefined`
 * in that case — record.ts's wrapper functions treat that as "nothing to
 * record" and return without writing anything, same as any other
 * fire-and-forget failure.
 */

import { type AnalyticsStore, createPostgresAnalyticsStore } from "@hire-me-mcp/core/analytics";
import { createDbClient, type DbClient, loadDbConfig } from "@hire-me-mcp/core/db";

let cachedDbClient: DbClient | undefined;
/** `undefined` = not yet resolved; `null` = resolved to "unavailable" (missing config); otherwise the store. */
let cachedStore: AnalyticsStore | null | undefined;

/**
 * Returns the shared, memoized `AnalyticsStore`, constructing it on first
 * call. Returns `undefined` (logging once, not throwing) when
 * `DATABASE_URL` isn't configured — the expected case in local dev without
 * a database and in most unit test runs.
 */
export function getAnalyticsStore(): AnalyticsStore | undefined {
  if (cachedStore !== undefined) return cachedStore ?? undefined;

  try {
    const dbConfig = loadDbConfig();
    const dbClient = createDbClient(dbConfig);
    cachedDbClient = dbClient;
    cachedStore = createPostgresAnalyticsStore(dbClient.sql);
    return cachedStore;
  } catch (error) {
    console.warn(
      "[analytics] DATABASE_URL is not configured — usage analytics will not be recorded for this instance",
      error,
    );
    cachedStore = null;
    return undefined;
  }
}

/** Test-only: closes the pooled connection (if built) and clears memoized state, so the next call rebuilds from scratch. */
export async function resetAnalyticsStoreForTests(): Promise<void> {
  await cachedDbClient?.close();
  cachedDbClient = undefined;
  cachedStore = undefined;
}
