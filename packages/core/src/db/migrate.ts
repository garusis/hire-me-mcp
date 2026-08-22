/**
 * Migration runner for the Neon Postgres + pgvector store (#14).
 *
 * Tracks applied migrations in a `schema_migrations` table (created on
 * first run) and only executes the ones {@link selectPendingMigrations}
 * says are still pending — so running this against an already-migrated
 * database is a no-op (no error, nothing re-applied), satisfying the
 * "running it a second time is a no-op" acceptance criterion.
 *
 * Each migration's statements run inside their own transaction
 * (`sql.begin`), together with the `schema_migrations` insert that marks
 * them applied — so a mid-migration failure never leaves a migration
 * half-applied-but-marked-done.
 *
 * Statements run via `sql.unsafe()` one at a time (rather than as one
 * multi-statement string) to avoid depending on postgres.js's simple-query
 * protocol mode for multi-statement execution — see `migrations.ts` for why
 * each migration is authored as a statement array.
 */

import type { Sql } from "postgres";
import type { Migration } from "./migrations.js";
import { migrations as defaultMigrations, selectPendingMigrations } from "./migrations.js";

export interface MigrateResult {
  /** Ids of migrations actually applied during this call (empty = no-op). */
  appliedMigrationIds: string[];
}

const CREATE_SCHEMA_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Runs every migration from `migrationsToRun` (defaults to the full
 * registry) that hasn't already been applied, against `sql`.
 */
export async function runMigrations(
  sql: Sql,
  migrationsToRun: Migration[] = defaultMigrations,
): Promise<MigrateResult> {
  await sql.unsafe(CREATE_SCHEMA_MIGRATIONS_TABLE);

  const appliedRows = await sql`SELECT id FROM schema_migrations`;
  const appliedIds = appliedRows.map((row) => (row as { id: string }).id);
  const pending = selectPendingMigrations(migrationsToRun, appliedIds);

  const appliedMigrationIds: string[] = [];
  for (const migration of pending) {
    await sql.begin(async (tx) => {
      for (const statement of migration.statements) {
        await tx.unsafe(statement);
      }
      await tx`INSERT INTO schema_migrations (id) VALUES (${migration.id})`;
    });
    appliedMigrationIds.push(migration.id);
  }

  return { appliedMigrationIds };
}

/** Human-readable one-liner for the migration CLI's stdout. */
export function formatMigrateSummary(result: MigrateResult): string {
  const { appliedMigrationIds } = result;
  if (appliedMigrationIds.length === 0) {
    return "Already up to date — no migrations applied.";
  }
  const noun = appliedMigrationIds.length === 1 ? "migration" : "migrations";
  return `Applied ${appliedMigrationIds.length} ${noun}: ${appliedMigrationIds.join(", ")}`;
}
