/**
 * Builds the clean HTTP response returned when a caller is over the
 * configured rate limit. This runs BEFORE the MCP request handler
 * (`with-rate-limit.ts`), so the caller always gets a complete, parseable
 * JSON body and headers — never a truncated stream or a bare 500.
 *
 * Headers follow the IETF `RateLimit` header field draft
 * (https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers)
 * plus the long-standing `Retry-After` (RFC 9110) that HTTP clients and
 * proxies already understand, so both a spec-aware and a naive caller can
 * discover when to retry.
 */

import type { RateLimitOutcome } from "./limiter";

const RATE_LIMITED_ERROR_CODE = "rate_limited";

function retryAfterSeconds(resetEpochMs: number, nowEpochMs: number): number {
  return Math.max(0, Math.ceil((resetEpochMs - nowEpochMs) / 1000));
}

/**
 * Builds the 429 response for a blocked caller. `now` is injectable (defaults to
 * `Date.now()`) purely so tests can assert exact `Retry-After` values deterministically.
 */
export function buildRateLimitExceededResponse(
  outcome: Pick<RateLimitOutcome, "limit" | "remaining" | "reset">,
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

  const body = {
    error: {
      code: RATE_LIMITED_ERROR_CODE,
      message:
        `Too many requests from this client — the limit is ${outcome.limit} requests per ` +
        `configured window. Retry after ${retryAfter} second(s). See the "Rate limiting" ` +
        "section of the hire-me-mcp README for the current default limit and how it's configured.",
    },
  };

  return new Response(JSON.stringify(body), { status: 429, headers });
}

/**
 * Tags an ALLOWED response (`with-rate-limit.ts`'s success path) with the
 * same `RateLimit-*` header family as the 429 builder above, so a normal,
 * under-limit caller can inspect its remaining budget instead of only ever
 * learning about the limit once already blocked (#69's preview smoke suite
 * asserts this on a real deployed request). Deliberately does NOT set
 * `Retry-After` — there is nothing to retry when the request already
 * succeeded, so that header stays reserved for the 429 case. Status, body,
 * and every header the wrapped handler already set are preserved untouched.
 */
export function attachRateLimitHeaders(
  response: Response,
  outcome: Pick<RateLimitOutcome, "limit" | "remaining" | "reset">,
  now: number = Date.now(),
): Response {
  const headers = new Headers(response.headers);
  headers.set("RateLimit-Limit", String(outcome.limit));
  headers.set("RateLimit-Remaining", String(Math.max(0, outcome.remaining)));
  headers.set("RateLimit-Reset", String(retryAfterSeconds(outcome.reset, now)));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
