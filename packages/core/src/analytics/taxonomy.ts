/**
 * The fixed, documented vocabulary the anonymized usage analytics pipeline
 * (#79) is allowed to store. Every field on a stored event must come from
 * one of these closed lists — nothing free-form, nothing derived from raw
 * request content — so the schema itself is the first line of defense
 * against ever persisting anything identifying. `scrubber.ts` enforces
 * these lists at write time; this module just names them once so the
 * scrubber, the repository, and every call site agree.
 */

/** Where a tool call or chat turn originated. */
export const SURFACES = ["mcp", "chat"] as const;
export type AnalyticsSurface = (typeof SURFACES)[number];

/**
 * The outcome taxonomy for a tool call (MCP tool invocation, or a
 * tool the chat agent calls) and for the chat pipeline as a whole.
 *
 * Scope note (owner decision, 2026-08-23, epic #8 comments): all write
 * tools (contact, book_call) and the write guard were cut before this
 * issue landed, so there is no `refused` outcome for a write guard to
 * produce. What remains is: a call succeeded (`success`), the caller's
 * input failed validation (`invalid_input`), the tool's own domain logic
 * rejected it (`domain_error`), something unexpected broke
 * (`internal_error`), or the caller was rate limited before the tool ever
 * ran (`rate_limited`) — reusing the exact three MCP adapter error codes
 * (`apps/web/lib/mcp/errors.ts`) plus `success` and `rate_limited`, so
 * there is only ever one outcome vocabulary in the whole system.
 */
export const TOOL_OUTCOMES = [
  "success",
  "invalid_input",
  "domain_error",
  "internal_error",
  "rate_limited",
] as const;
export type ToolOutcome = (typeof TOOL_OUTCOMES)[number];

/**
 * The deterministic keyword taxonomy a chat question is classified into —
 * see `theme-classifier.ts`. `other` is the required catch-all bucket so
 * every question has a home even when no keyword rule matches.
 */
export const QUESTION_THEMES = [
  "experience",
  "skills",
  "availability",
  "rates",
  "technology",
  "other",
] as const;
export type QuestionTheme = (typeof QUESTION_THEMES)[number];

/**
 * Coarse latency buckets, never a raw millisecond value. A raw duration on
 * its own isn't identifying, but bucketing keeps the stored precision
 * deliberately coarse (matching the "generalize, don't store the exact
 * value" spirit of the rest of this schema) and keeps the set of distinct
 * values small enough to be a genuine dimension for group-by queries.
 */
export const LATENCY_BUCKETS = [
  "under_100ms",
  "under_500ms",
  "under_2s",
  "under_10s",
  "over_10s",
] as const;
export type LatencyBucket = (typeof LATENCY_BUCKETS)[number];

const BUCKET_THRESHOLDS_MS: ReadonlyArray<readonly [number, LatencyBucket]> = [
  [100, "under_100ms"],
  [500, "under_500ms"],
  [2_000, "under_2s"],
  [10_000, "under_10s"],
];

/**
 * Maps a raw latency in milliseconds to its {@link LatencyBucket}. A
 * negative value (clock skew, a bug) is treated as the smallest bucket
 * rather than thrown on — this is a best-effort analytics label, not a
 * correctness-critical value worth failing a request over.
 */
export function bucketLatencyMs(latencyMs: number): LatencyBucket {
  const value = Math.max(0, latencyMs);
  for (const [threshold, bucket] of BUCKET_THRESHOLDS_MS) {
    if (value < threshold) return bucket;
  }
  return "over_10s";
}
