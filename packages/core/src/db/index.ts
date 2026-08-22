/**
 * Public surface of the Neon Postgres + pgvector store module (#14),
 * exposed as `@hire-me-mcp/core/db` — a separate subpath from the package's
 * main entry point (mirroring `./slugify`) so consumers that don't need a
 * database driver (e.g. `apps/web`'s client-safe code) never pull in
 * `postgres` just by importing `@hire-me-mcp/core`.
 *
 * Consumers: the future ingestion pipeline (#24) and `searchCareer` (#34).
 */

export type {
  CareerChunkInput,
  CareerChunkRecord,
  ChunkCitation,
  FindSimilarChunksOptions,
  SimilarChunkMatch,
} from "./chunks-repository.js";
export {
  EMBEDDING_DIMENSION,
  findSimilarChunks,
  getChunkById,
  InvalidEmbeddingDimensionError,
  parseCitation,
  toVectorLiteral,
  upsertChunk,
} from "./chunks-repository.js";
export type { DbClient } from "./client.js";
export { createDbClient } from "./client.js";
export type { DbConfig } from "./config.js";
export { loadDbConfig, MissingDatabaseUrlError } from "./config.js";
export type { MigrateResult } from "./migrate.js";
export { formatMigrateSummary, runMigrations } from "./migrate.js";
export type { Migration } from "./migrations.js";
export { migrations, selectPendingMigrations } from "./migrations.js";
export type {
  NeonBranchConfig,
  NeonConnectionUri,
  NeonCreateBranchResponse,
  NeonTestBranch,
} from "./neon-branch.js";
export {
  buildPooledConnectionUri,
  createNeonTestBranch,
  deleteNeonTestBranch,
  loadNeonBranchConfig,
} from "./neon-branch.js";
