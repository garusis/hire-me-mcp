/**
 * Builds the 429 response for a chat caller over the per-session or per-IP
 * limit (#68). Same header family as the MCP route's
 * `../mcp/rate-limit/response.ts` (`RateLimit-*` per the IETF draft, plus
 * `Retry-After`) — that module isn't reused directly here because its body
 * hardcodes a single `"rate_limited"` code; #68 needs the two limits told
 * apart (`session_rate_limited` vs `ip_rate_limited`), each with its own
 * short, UI-safe message from `error-codes.ts`.
 */

import { buildChatErrorPayload, type ChatErrorCode } from "./error-codes";

export interface ChatRateLimitOutcome {
  limit: number;
  remaining: number;
  reset: number;
}

function retryAfterSeconds(resetEpochMs: number, nowEpochMs: number): number {
  return Math.max(0, Math.ceil((resetEpochMs - nowEpochMs) / 1000));
}

/**
 * Builds the 429 response for `code` (`"session_rate_limited"` or
 * `"ip_rate_limited"`). `now` is injectable purely so tests can assert
 * exact `Retry-After` values deterministically.
 */
export function buildChatRateLimitExceededResponse(
  code: Extract<ChatErrorCode, "session_rate_limited" | "ip_rate_limited">,
  outcome: ChatRateLimitOutcome,
  now: number = Date.now(),
): Response {
  const retryAfter = retryAfterSeconds(outcome.reset, now);
  const remaining = Math.max(0, outcome.remaining);

  const headers = new Headers({
    "Content-Type": "application/json",
    "RateLimit-Limit": String(outcome.limit),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(retryAfter),
    "Retry-After": String(retryAfter),
  });

  return new Response(JSON.stringify(buildChatErrorPayload(code)), { status: 429, headers });
}
