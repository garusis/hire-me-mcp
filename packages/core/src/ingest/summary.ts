import type { IngestSummary } from "./types.js";

/**
 * One-line, CI-log-friendly rendering of an {@link IngestSummary} — makes
 * re-index behavior (inserted/updated/deleted/unchanged counts, how many
 * embedding calls were made, wall time) visible in CI output without
 * requiring structured log parsing.
 */
export function formatIngestSummary(summary: IngestSummary): string {
  const prefix = summary.dryRun ? "[dry-run] " : "";
  return (
    `${prefix}inserted: ${summary.inserted}, updated: ${summary.updated}, ` +
    `deleted: ${summary.deleted}, unchanged: ${summary.unchanged}, ` +
    `embedding calls: ${summary.embeddingCalls}, wall time: ${summary.wallTimeMs}ms`
  );
}
