import { describe, expect, it } from "vitest";
import { buildRateLimitExceededResponse } from "./response";

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
