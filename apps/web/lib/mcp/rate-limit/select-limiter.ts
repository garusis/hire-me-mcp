/**
 * Chooses which `RateLimiter` implementation `app/api/mcp/route.ts` wires up
 * — the route's only call site for this decision, kept as one pure,
 * independently testable function rather than inline module-scope branching
 * so the selection logic itself has a co-located unit test.
 *
 * Precedence:
 * 1. `MCP_TEST_RATE_LIMITER === "1"` -> the deterministic in-memory test
 *    limiter (`test-limiter.ts`), which actually enforces `config.limit`.
 *    This flag exists solely for the protocol-level MCP integration suite
 *    (#49) to exercise the real 429 path in CI, where Upstash credentials
 *    are never present — see `test-limiter.ts` for why that's otherwise
 *    unobservable. It must never be set outside that suite's own server
 *    process.
 * 2. Otherwise, the real `createRateLimiter` (`limiter.ts`): Upstash-backed
 *    when credentials are present, fail-open otherwise — unchanged
 *    production/preview behaviour.
 */

import type { RateLimitConfig } from "./config";
import { createRateLimiter, type RateLimiter, type UpstashEnv } from "./limiter";
import { createDeterministicTestLimiter } from "./test-limiter";

const TEST_LIMITER_FLAG = "MCP_TEST_RATE_LIMITER";

/** Minimal shape of `process.env` this module reads. */
export type SelectLimiterEnv = Record<string, string | undefined>;

/** Builds the `RateLimiter` the route should use for `config`, reading `env` (defaults to `process.env`). */
export function selectRateLimiter(
  config: RateLimitConfig,
  env: SelectLimiterEnv = process.env,
): RateLimiter {
  if (env[TEST_LIMITER_FLAG] === "1") {
    return createDeterministicTestLimiter(config);
  }
  return createRateLimiter(config, env as UpstashEnv);
}
