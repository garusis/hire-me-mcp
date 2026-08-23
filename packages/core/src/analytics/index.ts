/**
 * Public surface of the anonymized usage-analytics pipeline (#79), exposed
 * as `@hire-me-mcp/core/analytics` — a separate subpath (mirroring `./db`)
 * so consumers that don't record analytics never pull in `postgres` just
 * by importing `@hire-me-mcp/core`.
 *
 * Consumers: the MCP adapter layer and the chat pipeline (both
 * `apps/web`), the retention cron route (`apps/web`), and the db-integration
 * test suite.
 */

export type { DeleteExpiredResult } from "./analytics-repository.js";
export {
  deleteExpiredAnalyticsEvents,
  insertQuestionEvent,
  insertToolEvent,
  resetAnalyticsEvents,
} from "./analytics-repository.js";
export { computeRetentionCutoff, RETENTION_WINDOW_DAYS, runRetentionJob } from "./retention.js";
export type {
  QuestionEventInput,
  ScrubbedQuestionEvent,
  ScrubbedToolEvent,
  ToolEventInput,
} from "./scrubber.js";
export { AnalyticsScrubError, scrubQuestionEvent, scrubToolEvent } from "./scrubber.js";
export type { AnalyticsStore } from "./store.js";
export {
  createPostgresAnalyticsStore,
  recordQuestionEvent,
  recordToolEvent,
} from "./store.js";
export type {
  AnalyticsSurface,
  LatencyBucket,
  QuestionTheme,
  ToolOutcome,
} from "./taxonomy.js";
export {
  bucketLatencyMs,
  LATENCY_BUCKETS,
  QUESTION_THEMES,
  SURFACES,
  TOOL_OUTCOMES,
} from "./taxonomy.js";
export { classifyQuestionTheme } from "./theme-classifier.js";
