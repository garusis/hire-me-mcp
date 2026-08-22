/**
 * Public surface of the ingestion pipeline (#24) — not exposed as a
 * `@hire-me-mcp/core` subpath (unlike `./db`/`./embedding`) since nothing
 * outside this package's own CLI (`cli.ts`, run as `pnpm ingest`) needs to
 * import it; kept as a plain barrel for the module's own tests instead.
 */

export type { IngestArgs } from "./args.js";
export { InvalidIngestArgError, parseIngestArgs } from "./args.js";
export type { ComputeIngestDiffOptions, IngestDiff } from "./diff.js";
export { computeIngestDiff } from "./diff.js";
export type { IngestEmbedder, RunIngestOptions } from "./run.js";
export { runIngest } from "./run.js";
export type { IngestStore } from "./store.js";
export { createDbIngestStore } from "./store.js";
export { formatIngestSummary } from "./summary.js";
export type { EmbeddedChunk, IngestSummary } from "./types.js";
