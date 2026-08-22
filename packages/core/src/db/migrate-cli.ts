import { createDbClient } from "./client.js";
import { loadDbConfig, MissingDatabaseUrlError } from "./config.js";
import { formatMigrateSummary, runMigrations } from "./migrate.js";

/**
 * `pnpm --filter @hire-me-mcp/core db:migrate` entry point (#14).
 *
 * Reads `DATABASE_URL`, applies every pending migration, prints a summary,
 * and closes the connection. Exits non-zero with a clear, driver-error-free
 * message when `DATABASE_URL` isn't configured — see `.env.example` and
 * README.md's "Database (Neon pgvector store)" section.
 */
try {
  const config = loadDbConfig();
  const client = createDbClient(config);
  try {
    const result = await runMigrations(client.sql);
    console.log(formatMigrateSummary(result));
  } finally {
    await client.close();
  }
} catch (error) {
  if (error instanceof MissingDatabaseUrlError) {
    console.error(error.message);
  } else {
    console.error("Migration failed:", error);
  }
  process.exit(1);
}
