import { describe, expect, it } from "vitest";
import { attachRateLimitHeaders, buildRateLimitExceededResponse } from "./response";

describe("buildRateLimitExceededResponse", () => {
  it("returns HTTP 429 with RateLimit-* and Retry-After headers derived from the outcome", async () => {
    const now = Date.now();
    const response = buildRateLimitExceededResponse(
      { limit: 5, remaining: 0, reset: now + 30_000 },
      now,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("RateLimit-Limit")).toBe("5");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("RateLimit-Reset")).toBe("30");
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("clamps a reset time in the past to a non-negative Retry-After", async () => {
    const now = Date.now();
    const response = buildRateLimitExceededResponse(
      { limit: 5, remaining: 0, reset: now - 5_000 },
      now,
    );

    expect(response.headers.get("Retry-After")).toBe("0");
  });

  it("returns a complete, parseable JSON body with a friendly message and no internal detail", async () => {
    const now = Date.now();
    const response = buildRateLimitExceededResponse(
      { limit: 5, remaining: 0, reset: now + 30_000 },
      now,
    );

    const text = await response.text();
    const body = JSON.parse(text) as { error: { code: string; message: string } };

    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toContain("5");
    expect(body.error.message.toLowerCase()).not.toContain("stack");
    expect(body.error.message).not.toMatch(/\/Users\/|\/home\/|node_modules/);
    expect(body.error.message).not.toMatch(/UPSTASH|REDIS_REST_TOKEN/i);
  });
});

describe("attachRateLimitHeaders", () => {
  it("adds RateLimit-* headers derived from the outcome to an allowed response, preserving status/body/existing headers", async () => {
    const now = Date.now();
    const inner = new Response("ok", { status: 200, headers: { "X-Test": "1" } });

    const response = attachRateLimitHeaders(
      inner,
      { limit: 60, remaining: 59, reset: now + 30_000 },
      now,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Test")).toBe("1");
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    expect(response.headers.get("RateLimit-Remaining")).toBe("59");
    expect(response.headers.get("RateLimit-Reset")).toBe("30");
    // Retry-After is only meaningful once a caller is actually blocked
    // (buildRateLimitExceededResponse) — an allowed response has nothing to
    // retry, so this header is deliberately not added here.
    expect(response.headers.get("Retry-After")).toBeNull();
    await expect(response.text()).resolves.toBe("ok");
  });

  it("clamps a negative remaining to 0, same as the 429 builder", () => {
    const now = Date.now();
    const response = attachRateLimitHeaders(
      new Response("ok"),
      { limit: 60, remaining: -3, reset: now + 1000 },
      now,
    );

    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
  });
});
