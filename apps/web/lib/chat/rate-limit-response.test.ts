import { describe, expect, it } from "vitest";
import { buildChatRateLimitExceededResponse } from "./rate-limit-response";

const OUTCOME = { limit: 20, remaining: 0, reset: Date.UTC(2026, 0, 1, 0, 0, 5) };
const NOW = Date.UTC(2026, 0, 1, 0, 0, 0);

describe("buildChatRateLimitExceededResponse", () => {
  it("returns 429 with the caller-specified error code", async () => {
    const response = buildChatRateLimitExceededResponse("session_rate_limited", OUTCOME, NOW);
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("session_rate_limited");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("uses a distinct code for the IP backstop", async () => {
    const response = buildChatRateLimitExceededResponse("ip_rate_limited", OUTCOME, NOW);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("ip_rate_limited");
  });

  it("sets standard rate-limit and Retry-After headers", () => {
    const response = buildChatRateLimitExceededResponse("session_rate_limited", OUTCOME, NOW);
    expect(response.headers.get("RateLimit-Limit")).toBe("20");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("RateLimit-Reset")).toBe("5");
  });
});
