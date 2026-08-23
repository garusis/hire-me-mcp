/**
 * Truncates `career_chunks` inside an already-migrated branch (#173).
 *
 * Neon test branches fork from the project's default branch, which — since
 * the first production reindex (#52) — has real rows in `career_chunks`.
 * A freshly created disposable branch therefore inherits that data rather
 * than starting empty. Suites that seed their own fixtures and assert on
 * exact row counts/ordering (ingest's `run.integration.test.ts`,
 * `search-career.integration.test.ts`) need the table empty before they
 * run, regardless of what the parent branch looked like at fork time.
 *
 * This only truncates the data table — it doesn't touch schema. Contrast
 * with `rag-store.integration.test.ts`'s own reset (#165), which drops
 * `career_chunks`/`schema_migrations` entirely because that suite's whole
 * point is asserting fresh-migration behavior.
 */

import type { Sql } from "postgres";

export async function resetCareerChunks(sql: Sql): Promise<void> {
  await sql`TRUNCATE TABLE career_chunks RESTART IDENTITY`;
}
