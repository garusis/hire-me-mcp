import { afterEach, describe, expect, it, vi } from "vitest";
import { identifyCaller } from "./identify-caller";
import type { RateLimiter, RateLimitOutcome } from "./limiter";
import { withRateLimit } from "./with-rate-limit";

/** Deterministic, in-memory fake standing in for the real Upstash-backed limiter (#39 AC: injectable/in-memory for tests). */
function createFakeLimiter(limit: number, windowMs: number): RateLimiter {
  const counts = new Map<string, number>();
  return {
    async limit(identifier: string): Promise<RateLimitOutcome> {
      const count = (counts.get(identifier) ?? 0) + 1;
      counts.set(identifier, count);
      const remaining = Math.max(0, limit - count);
      return {
        success: count <= limit,
        limit,
        remaining,
        reset: Date.now() + windowMs,
      };
    },
  };
}

function makeRequest(ip = "203.0.113.5"): Request {
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("withRateLimit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes an under-limit request through to the wrapped handler unchanged", async () => {
    const limiter = createFakeLimiter(5, 60_000);
    const innerResponse = new Response("ok", { status: 200, headers: { "X-Test": "1" } });
    const handler = vi.fn(async () => innerResponse);
    const wrapped = withRateLimit(limiter, handler);

    const response = await wrapped(makeRequest());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response).toBe(innerResponse);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Test")).toBe("1");
  });

  it("returns a 429 with headers and a parseable body once a low limit is exceeded, without calling the handler", async () => {
    const limiter = createFakeLimiter(2, 60_000);
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(limiter, handler);
    const identifier = "burst-caller";
    const request = makeRequest(identifier);

    // Two allowed requests consume the limit.
    await wrapped(request);
    await wrapped(request);
    handler.mockClear();

    // Third request in the same window is over the limit.
    const blocked = await wrapped(request);

    expect(handler).not.toHaveBeenCalled();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("RateLimit-Limit")).toBe("2");
    expect(blocked.headers.get("RateLimit-Remaining")).toBe("0");
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(blocked.headers.get("Content-Type")).toContain("application/json");

    const body = await blocked.json();
    expect(body.error.code).toBe("rate_limited");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("keeps limiting each subsequent request in a burst, not just the first over-limit one", async () => {
    const limiter = createFakeLimiter(1, 60_000);
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(limiter, handler);
    const request = makeRequest("repeat-offender");

    await wrapped(request);
    const second = await wrapped(request);
    const third = await wrapped(request);

    expect(second.status).toBe(429);
    expect(third.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("identifies callers independently, so one caller's burst doesn't block another", async () => {
    const limiter = createFakeLimiter(1, 60_000);
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(limiter, handler);

    await wrapped(makeRequest("caller-a"));
    const blockedA = await wrapped(makeRequest("caller-a"));
    const okB = await wrapped(makeRequest("caller-b"));

    expect(blockedA.status).toBe(429);
    expect(okB.status).toBe(200);
  });

  it("fails open (passes through) if the limiter itself throws, and logs a warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const throwingLimiter: RateLimiter = {
      limit: () => Promise.reject(new Error("redis unreachable")),
    };
    const innerResponse = new Response("ok", { status: 200 });
    const handler = vi.fn(async () => innerResponse);
    const wrapped = withRateLimit(throwingLimiter, handler);

    const response = await wrapped(makeRequest());

    expect(response).toBe(innerResponse);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("uses identifyCaller's precedence to key the limiter", async () => {
    const limiter = createFakeLimiter(1, 60_000);
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withRateLimit(limiter, handler);

    const request = new Request("https://example.com/api/mcp", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });
    expect(identifyCaller(request.headers)).toBe("203.0.113.5");

    await wrapped(request);
    const second = await wrapped(request);
    expect(second.status).toBe(429);
  });
});
