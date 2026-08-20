/**
 * Reads the per-IP rate-limit window/quota from environment variables,
 * with generous defaults for an interactive AI assistant driving the MCP
 * endpoint (a handful of tool calls per user turn, occasional retries).
 *
 * Overrides — see `.env.example` and the README "Rate limiting" section,
 * the canonical documentation both are required to link back to:
 *   - `RATELIMIT_MAX_REQUESTS` — requests allowed per window (default 60).
 *   - `RATELIMIT_WINDOW_SECONDS` — sliding window length in seconds (default 60).
 *
 * An unset, empty, non-numeric, non-integer, or non-positive value for
 * either variable falls back to its default rather than throwing — a
 * malformed override must not take the endpoint down.
 */

export interface RateLimitConfig {
  /** Maximum requests allowed per caller within `windowSeconds`. */
  limit: number;
  /** Sliding window length, in seconds. */
  windowSeconds: number;
}

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_SECONDS = 60;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Minimal shape of `process.env` this module reads — narrower than `NodeJS.ProcessEnv` so tests can pass a plain object without every required Node env var. */
export type RateLimitEnv = Record<string, string | undefined>;

/** Reads and validates `RATELIMIT_*` overrides from `env` (defaults to `process.env`). */
export function readRateLimitConfig(env: RateLimitEnv = process.env): RateLimitConfig {
  return {
    limit: parsePositiveInt(env.RATELIMIT_MAX_REQUESTS, DEFAULT_LIMIT),
    windowSeconds: parsePositiveInt(env.RATELIMIT_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS),
  };
}
