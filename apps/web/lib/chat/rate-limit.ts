/**
 * Per-session and per-IP rate limiting for `POST /api/chat` (#68).
 *
 * Deliberately reuses the exact mechanism #39 built for the MCP route
 * (`../mcp/rate-limit/limiter.ts`'s Upstash-backed sliding window, with the
 * same fail-open-without-credentials behaviour) rather than inventing a
 * second rate-limiting stack — the only new things here are (1) chat-scoped
 * config/defaults, (2) two limiter instances instead of one, keyed into
 * distinct Redis namespaces (`limiter.ts`'s `namespace` param, added by
 * this issue) so chat counters can never collide with the MCP route's or
 * each other's, and (3) a chat-specific test-limiter flag mirroring
 * `MCP_TEST_RATE_LIMITER`'s pattern (`../mcp/rate-limit/select-limiter.ts`)
 * for this suite's own deterministic 429 coverage.
 *
 * ## Chosen limits
 *
 * - Session: 20 requests / 5 minutes. A chat "request" here is one turn
 *   (one `POST`, which may itself contain several agent tool-call steps —
 *   see `agent-limits.ts` for the separate per-turn step cap). 20 turns in
 *   5 minutes is generous for an attentive human reading an interview
 *   agent's answers between messages, and tight enough to bound one
 *   session's cost on a portfolio demo funded out of pocket.
 * - IP: 40 requests / 5 minutes — double the session limit, as a backstop
 *   for a client that rotates its session id to evade the per-session
 *   limit (the #68 AC this is written to satisfy), not the primary control.
 *   A shared office/NAT IP genuinely running two simultaneous sessions
 *   still fits comfortably under it.
 *
 * Both windows match in length so `Retry-After` behaves predictably
 * regardless of which limit a caller trips.
 */

import type { RateLimitConfig } from "../mcp/rate-limit/config";
import { createRateLimiter, type RateLimiter, type UpstashEnv } from "../mcp/rate-limit/limiter";
import { createDeterministicTestLimiter } from "../mcp/rate-limit/test-limiter";

export interface ChatRateLimitConfig {
  session: RateLimitConfig;
  ip: RateLimitConfig;
}

/** The documented default limits — see module docs for the rationale behind each number. */
export const CHAT_RATE_LIMIT_DEFAULTS: ChatRateLimitConfig = {
  session: { limit: 20, windowSeconds: 300 },
  ip: { limit: 40, windowSeconds: 300 },
};

/** Minimal shape of `process.env` this module reads. */
export type ChatRateLimitEnv = Record<string, string | undefined>;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Reads `CHAT_SESSION_RATELIMIT_*` / `CHAT_IP_RATELIMIT_*` overrides from
 * `env` (defaults to `process.env`), falling back to
 * {@link CHAT_RATE_LIMIT_DEFAULTS} for anything unset, empty, or malformed —
 * same fail-safe behaviour as the MCP route's `readRateLimitConfig`.
 */
export function readChatRateLimitConfig(env: ChatRateLimitEnv = process.env): ChatRateLimitConfig {
  return {
    session: {
      limit: parsePositiveInt(
        env.CHAT_SESSION_RATELIMIT_MAX_REQUESTS,
        CHAT_RATE_LIMIT_DEFAULTS.session.limit,
      ),
      windowSeconds: parsePositiveInt(
        env.CHAT_SESSION_RATELIMIT_WINDOW_SECONDS,
        CHAT_RATE_LIMIT_DEFAULTS.session.windowSeconds,
      ),
    },
    ip: {
      limit: parsePositiveInt(
        env.CHAT_IP_RATELIMIT_MAX_REQUESTS,
        CHAT_RATE_LIMIT_DEFAULTS.ip.limit,
      ),
      windowSeconds: parsePositiveInt(
        env.CHAT_IP_RATELIMIT_WINDOW_SECONDS,
        CHAT_RATE_LIMIT_DEFAULTS.ip.windowSeconds,
      ),
    },
  };
}

export interface ChatRateLimiters {
  session: RateLimiter;
  ip: RateLimiter;
}

const TEST_LIMITER_FLAG = "CHAT_TEST_RATE_LIMITER";

/**
 * Builds the two `RateLimiter`s `handler.ts` checks before running the
 * agent. Precedence mirrors `../mcp/rate-limit/select-limiter.ts`:
 *
 * 1. `CHAT_TEST_RATE_LIMITER === "1"` -> deterministic in-memory limiters
 *    (`../mcp/rate-limit/test-limiter.ts`) that actually enforce the
 *    configured limit — this suite's own 429-path coverage, since the real
 *    limiter fails open without Upstash credentials (never present in CI).
 * 2. Otherwise, the real Upstash-backed limiter (`createRateLimiter`),
 *    namespaced `"chat-session"` / `"chat-ip"` so its Redis keys never
 *    collide with the MCP route's or each other's.
 */
export function selectChatRateLimiters(
  config: ChatRateLimitConfig,
  env: ChatRateLimitEnv = process.env,
): ChatRateLimiters {
  if (env[TEST_LIMITER_FLAG] === "1") {
    return {
      session: createDeterministicTestLimiter(config.session),
      ip: createDeterministicTestLimiter(config.ip),
    };
  }
  return {
    session: createRateLimiter(config.session, env as UpstashEnv, "chat-session"),
    ip: createRateLimiter(config.ip, env as UpstashEnv, "chat-ip"),
  };
}
