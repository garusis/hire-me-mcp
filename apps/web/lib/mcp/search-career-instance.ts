/**
 * The single, memoized `SearchCareer` instance the `search-career` MCP tool
 * (#61) calls, bound to the real Neon pgvector store and the real Google
 * embedding provider.
 *
 * `apps/web` is the FIRST runtime consumer of `@hire-me-mcp/core/db` — every
 * other tool in this server reads only `@hire-me-mcp/core`'s framework-free
 * content layer (`src/lib/content/repository.ts`), which never opens a
 * network connection. This module mirrors that file's module-level
 * memoization (`getCareerDataRepository()`), applied to a live `postgres`
 * connection pool instead of static content:
 *
 * - `packages/core/README.md`'s "Database (Neon pgvector store)" section
 *   documents `createDbClient`'s pool (`postgres`, `max: 5`,
 *   `idle_timeout: 20`) as already designed for the serverless case — lazy
 *   connect (no I/O at construction), small bounded pool, graceful
 *   `sql.end()`. On Vercel, a warm Lambda instance reuses this module's
 *   state across invocations (Node module caching persists for the
 *   container's lifetime), so building the client once here and reusing it
 *   is strictly better than reconnecting per request: it reuses pooled TCP
 *   connections instead of paying a fresh handshake (plus Neon cold-start
 *   latency) on every `search-career` call. A cold Lambda simply rebuilds
 *   it once, same as `getCareerDataRepository()` rebuilds its repository
 *   once per cold start.
 * - `resetSearchCareerForTests()` is the explicit "close/clean up" hook
 *   this pattern still needs — not for the request path (a serverless
 *   function's process exit reclaims the pool; there is no per-request
 *   teardown to do), but for tests that construct a client against a
 *   throwaway Neon branch (or a mocked client) and must not leak
 *   connections or memoized state across test files/cases.
 *
 * Query-time embedding uses Gemini's `RETRIEVAL_QUERY` task type — the same
 * asymmetric-retrieval convention `eval-retrieval/cli.ts` already
 * established for `searchCareer` (`RETRIEVAL_DOCUMENT` is for ingestion
 * only, see `ingest/cli.ts`).
 *
 * `getSearchCareer()` throws — never swallows or logs — when
 * `DATABASE_URL`/`GOOGLE_GENERATIVE_AI_API_KEY` are missing
 * (`MissingDatabaseUrlError`/`MissingEmbeddingApiKeyError`, both already
 * safe, secret-free messages). The `search-career` tool handler is
 * responsible for catching that, logging it server-side, and mapping it to
 * the server's generic sanitized error envelope (#61's graceful-degradation
 * acceptance criterion) — this module's only job is construction.
 */

import { createDbClient, type DbClient, loadDbConfig } from "@hire-me-mcp/core/db";
import { createGoogleEmbeddingClient, loadEmbeddingApiKey } from "@hire-me-mcp/core/embedding";
import { createSearchCareer, type SearchCareer } from "@hire-me-mcp/core/search-career";

let cachedDbClient: DbClient | undefined;
let cachedSearchCareer: SearchCareer | undefined;

/**
 * Returns the shared, memoized `SearchCareer` instance, constructing it on
 * first call. Reads (and validates) `DATABASE_URL` and
 * `GOOGLE_GENERATIVE_AI_API_KEY` before creating any client, so a missing
 * env var never leaves a half-constructed db connection behind.
 */
export function getSearchCareer(): SearchCareer {
  if (cachedSearchCareer) return cachedSearchCareer;

  const dbConfig = loadDbConfig();
  const apiKey = loadEmbeddingApiKey();

  const dbClient = createDbClient(dbConfig);
  cachedDbClient = dbClient;
  const embedder = createGoogleEmbeddingClient({ apiKey, taskType: "RETRIEVAL_QUERY" });
  cachedSearchCareer = createSearchCareer({ sql: dbClient.sql, embedder });
  return cachedSearchCareer;
}

/**
 * Test-only: closes the pooled connection (if one was ever built) and
 * clears the memoized instance, so the next {@link getSearchCareer} call
 * rebuilds from scratch. Never called from request-handling code — see this
 * module's docstring for why the request path deliberately never closes the
 * pool itself.
 */
export async function resetSearchCareerForTests(): Promise<void> {
  await cachedDbClient?.close();
  cachedDbClient = undefined;
  cachedSearchCareer = undefined;
}
