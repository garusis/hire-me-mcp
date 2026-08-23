import { describe, expect, it, vi } from "vitest";
import type { RateLimiter, RateLimitOutcome } from "./limiter";
import { withRateLimit } from "./with-rate-limit";

/**
 * The route-level rate limiter (#39) rejects a caller BEFORE the MCP body
 * is ever parsed, so the exact tool that would have been called is
 * unknown at this layer — this records a single `surface: "mcp"`,
 * `outcome: "rate_limited"` tool event (toolName `"mcp_request"`, the
 * request as a whole) rather than trying to attribute the block to a
 * specific tool. See `define-tool.ts` for the per-tool events on the
 * allowed path.
 */
vi.mock("../../analytics/record.js", () => ({ recordMcpToolEvent: vi.fn() }));

function makeRequest(ip = "203.0.113.5"): Request {
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function alwaysBlockLimiter(): RateLimiter {
  const outcome: RateLimitOutcome = { success: false, limit: 1, remaining: 0, reset: Date.now() };
  return { limit: async () => outcome };
}

describe("withRateLimit analytics instrumentation (#79)", () => {
  it("records a rate_limited mcp tool event when a request is blocked", async () => {
    const { recordMcpToolEvent } = await import("../../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(alwaysBlockLimiter(), handler);

    await wrapped(makeRequest());

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(recordMcpToolEvent).toHaveBeenCalledWith(
      "mcp_request",
      "rate_limited",
      expect.any(Number),
    );
  });

  it("does not record a rate_limited event for an allowed request", async () => {
    const { recordMcpToolEvent } = await import("../../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const outcome: RateLimitOutcome = { success: true, limit: 5, remaining: 4, reset: Date.now() };
    const limiter: RateLimiter = { limit: async () => outcome };
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(limiter, handler);

    await wrapped(makeRequest());

    expect(recordMcpToolEvent).not.toHaveBeenCalled();
  });
});
