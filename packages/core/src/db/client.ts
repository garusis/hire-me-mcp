/**
 * Typed database client for the Neon Postgres + pgvector store (#14).
 *
 * Driver choice: `postgres` (porsager/postgres) over `pg` or
 * `@neondatabase/serverless`. It's a single, dependency-free package with
 * built-in TypeScript types, tagged-template queries (safe parameter
 * binding by default), a built-in connection pool, and first-class support
 * for the plain TCP connection string Neon's pooled `DATABASE_URL` already
 * is — no separate driver needed for local dev vs. serverless/edge, and no
 * extra runtime dependency beyond the driver itself (`@neondatabase/serverless`
 * pulls in `ws` for its WebSocket transport, which this project doesn't need
 * since nothing here runs on an edge runtime without TCP sockets).
 */

import postgres, { type Sql } from "postgres";
import type { DbConfig } from "./config.js";

export interface DbClient {
  /** The tagged-template query function (also exposes `.unsafe`, `.begin`, etc). */
  sql: Sql;
  /**
   * Gracefully closes the connection pool. Waits for in-flight queries to
   * finish, then closes, honoring `timeoutSeconds` if given (see
   * postgres.js's `sql.end({ timeout })`).
   */
  close(options?: { timeoutSeconds?: number }): Promise<void>;
}

/**
 * Creates a lazily-connecting Postgres client. No network I/O happens until
 * the first query — safe to call during module init / CLI startup.
 */
export function createDbClient(config: DbConfig): DbClient {
  const sql = postgres(config.connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 30,
    ssl: "require",
  });

  return {
    sql,
    close: (options) => sql.end({ timeout: options?.timeoutSeconds ?? 5 }),
  };
}
