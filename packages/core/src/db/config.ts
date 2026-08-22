/**
 * DB configuration for the Neon Postgres + pgvector vector store (#14).
 *
 * A single required env var — `DATABASE_URL` — is read here rather than
 * scattered across call sites, so every consumer (migration runner,
 * ingestion pipeline, `searchCareer`) fails the same loud, typed way when
 * it's missing rather than surfacing a raw driver connection error.
 */

export interface DbConfig {
  /** Postgres connection string (Neon's pooled connection string works fine). */
  connectionString: string;
}

/** Thrown by {@link loadDbConfig} when `DATABASE_URL` is unset or blank. */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Configure it in an untracked .env.local (see .env.example) " +
        "or your shell environment before connecting to the database.",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

/**
 * Reads and validates `DATABASE_URL` from the given environment (defaults to
 * `process.env`). Throws {@link MissingDatabaseUrlError} rather than letting
 * an empty connection string reach the Postgres driver as a confusing
 * low-level error.
 */
export function loadDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new MissingDatabaseUrlError();
  }
  return { connectionString };
}
