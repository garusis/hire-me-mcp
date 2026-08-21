/**
 * Constructs the rate limiter used by the MCP route (#39).
 *
 * Fail-open, by explicit product decision: if `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are missing (a fork's PR preview, local `next
 * dev`/`next start` without env vars, or CI, which is never given Upstash
 * credentials), the endpoint must still serve MCP traffic — degrading to no
 * limiting rather than a 500. The absence is logged loudly (`console.warn`)
 * exactly once per limiter instance so it's visible in Vercel/CI logs
 * without spamming per-request, but never thrown. The same fail-open
 * behaviour applies per-request if a *configured* limiter's call to Redis
 * itself throws (network blip, Upstash outage) — see `with-rate-limit.ts`,
 * which catches around `limiter.limit()`.
 *
 * Sliding window (`Ratelimit.slidingWindow`) is used per the library's own
 * recommendation for smoother enforcement than a fixed window, with the
 * ephemeral in-memory cache enabled so a caller already known to be blocked
 * is rejected locally on a warm serverless instance without spending a
 * Redis command per retry (https://upstash.com/docs/redis/sdks/ratelimit-ts/features).
 * The cache is created once at module scope — required by the library's own
 * docs, which warn it must live outside the request handler to be reused
 * across invocations on a warm instance.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimitConfig } from "./config";

/** The outcome of a single `limiter.limit(identifier)` check. */
export interface RateLimitOutcome {
  /** Whether this request is allowed to proceed. */
  success: boolean;
  /** Maximum requests allowed within the window. */
  limit: number;
  /** Requests remaining in the current window after this check. */
  remaining: number;
  /** Unix epoch milliseconds when the window resets. */
  reset: number;
}

/** The minimal interface `with-rate-limit.ts` depends on — real Upstash-backed or fail-open. */
export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitOutcome>;
}

/** Minimal shape of `process.env` this module reads — narrower than `NodeJS.ProcessEnv` so tests can pass a plain object without every required Node env var. */
export type UpstashEnv = Record<string, string | undefined>;

/** True only when both Upstash REST credentials are present and non-empty. */
export function hasUpstashCredentials(env: UpstashEnv): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

function createFailOpenLimiter(config: RateLimitConfig): RateLimiter {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not set — " +
      "/api/mcp is running WITHOUT rate limiting (fail-open, by design; see limiter.ts). " +
      "Expected in CI and local dev without Upstash credentials; must not happen in a " +
      "Vercel Preview or Production deploy.",
  );
  return {
    async limit(_identifier: string): Promise<RateLimitOutcome> {
      return {
        success: true,
        limit: config.limit,
        remaining: config.limit,
        reset: Date.now() + config.windowSeconds * 1000,
      };
    },
  };
}

/**
 * Builds this limiter's Ratelimit key prefix. `namespace`, when given,
 * scopes the whole caller (#68's per-session and per-IP chat limiters) into
 * its own Redis key space — `hire-me-mcp/ratelimit/<namespace>` — so its
 * counters can never collide with the MCP route's (#39) or another chat
 * limiter's, even when two limiters happen to see the same identifier
 * string. Omitting it (the MCP route's call site, unchanged) keeps the
 * original `"hire-me-mcp/ratelimit"` prefix exactly as before.
 */
function ratelimitPrefix(namespace: string | undefined): string {
  return namespace ? `hire-me-mcp/ratelimit/${namespace}` : "hire-me-mcp/ratelimit";
}

function createUpstashLimiter(config: RateLimitConfig, namespace?: string): RateLimiter {
  // Must be created once, outside any per-request handler, per the
  // library's own ephemeral-cache guidance referenced above.
  const ephemeralCache = new Map();
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
    ephemeralCache,
    prefix: ratelimitPrefix(namespace),
  });

  return {
    async limit(identifier: string): Promise<RateLimitOutcome> {
      const result = await ratelimit.limit(identifier);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
}

/**
 * Builds the limiter for `config`, reading Upstash credentials from `env`
 * (defaults to `process.env`). `namespace` (#68) scopes the Redis key
 * prefix — see {@link ratelimitPrefix} — so a second caller (e.g. `/api/chat`'s
 * per-session and per-IP limiters) can share this exact mechanism/store
 * without its counters colliding with the MCP route's (#39) or each
 * other's. Omit it for the original, unnamespaced MCP behaviour.
 */
export function createRateLimiter(
  config: RateLimitConfig,
  env: UpstashEnv = process.env,
  namespace?: string,
): RateLimiter {
  if (!hasUpstashCredentials(env)) {
    return createFailOpenLimiter(config);
  }
  return createUpstashLimiter(config, namespace);
}
