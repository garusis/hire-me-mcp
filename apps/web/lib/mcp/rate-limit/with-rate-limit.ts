/**
 * Wraps a Next.js route handler with per-IP rate limiting, enforced BEFORE
 * the wrapped handler runs — so an over-limit caller gets a clean HTTP 429
 * (`response.ts`) instead of a half-open MCP stream, and never touches
 * `mcp-handler`/the MCP server at all (#39).
 *
 * An allowed request's status, body, and every header the wrapped handler
 * already set are returned exactly as produced — but (#69) it is additionally
 * tagged with `RateLimit-*` headers derived from the outcome
 * (`attachRateLimitHeaders`, `response.ts`), so a caller under the limit can
 * still see its remaining budget rather than only learning about the limit
 * once already blocked. No outcome is ever fabricated: if the limiter itself
 * threw (fail-open-on-error, below), there is nothing to derive headers from,
 * so none are added.
 */

import { identifyCaller } from "./identify-caller";
import type { RateLimiter, RateLimitOutcome } from "./limiter";
import { attachRateLimitHeaders, buildRateLimitExceededResponse } from "./response";

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Builds a rate-limited route handler. `limiter` is injected so the real
 * Upstash-backed limiter, the fail-open limiter, and (in tests) a
 * deterministic in-memory fake are all interchangeable here.
 */
export function withRateLimit(limiter: RateLimiter, handler: RouteHandler): RouteHandler {
  return async (request: Request): Promise<Response> => {
    const identifier = identifyCaller(request.headers);
    let outcome: RateLimitOutcome | undefined;

    try {
      outcome = await limiter.limit(identifier);
      if (!outcome.success) {
        return buildRateLimitExceededResponse(outcome);
      }
    } catch (error) {
      // Fail open on a limiter error (e.g. Redis unreachable) rather than
      // 500ing a request that has nothing to do with the limiter itself —
      // see limiter.ts for the corresponding "no credentials" fail-open path.
      console.warn("[rate-limit] limiter.limit() threw — failing open for this request", error);
    }

    const response = await handler(request);
    return outcome === undefined ? response : attachRateLimitHeaders(response, outcome);
  };
}
