/**
 * A deterministic, in-memory `RateLimiter` used ONLY when the
 * `MCP_TEST_RATE_LIMITER` env var is set to `"1"` (see `select-limiter.ts`,
 * the route's only call site).
 *
 * Why this exists: `createRateLimiter` (`limiter.ts`) fails OPEN — always
 * `success: true`, ignoring `config.limit` entirely — whenever Upstash
 * credentials are absent, which is every CI run (#39, by explicit product
 * decision: the endpoint must never 500 for want of Redis). That means the
 * real limit-exceeded (429) behaviour is structurally unobservable in CI
 * without a substitute enforcement path. This module is that substitute:
 * a plain fixed-window counter, hermetic (no network, no timers beyond
 * `Date.now()`), used exclusively by the protocol-level MCP integration
 * suite (#49) to assert the documented 429 shape end-to-end against a real
 * started server. It is never selected unless the test-only flag is
 * explicitly set — see `select-limiter.ts` — so production and preview
 * behaviour (fail-open without Upstash credentials) is unchanged.
 */

import type { RateLimitConfig } from "./config";
import type { RateLimiter, RateLimitOutcome } from "./limiter";

interface WindowState {
  count: number;
  windowStartMs: number;
}

/** Builds a fixed-window, per-identifier in-memory limiter enforcing `config` exactly. */
export function createDeterministicTestLimiter(config: RateLimitConfig): RateLimiter {
  const windowMs = config.windowSeconds * 1000;
  const stateByIdentifier = new Map<string, WindowState>();

  return {
    async limit(identifier: string): Promise<RateLimitOutcome> {
      const now = Date.now();
      const existing = stateByIdentifier.get(identifier);
      const windowExpired = existing !== undefined && now - existing.windowStartMs >= windowMs;
      const state: WindowState =
        existing === undefined || windowExpired ? { count: 0, windowStartMs: now } : existing;

      state.count += 1;
      stateByIdentifier.set(identifier, state);

      return {
        success: state.count <= config.limit,
        limit: config.limit,
        remaining: Math.max(0, config.limit - state.count),
        reset: state.windowStartMs + windowMs,
      };
    },
  };
}
