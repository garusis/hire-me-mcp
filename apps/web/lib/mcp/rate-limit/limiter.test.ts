import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, hasUpstashCredentials } from "./limiter";

describe("hasUpstashCredentials", () => {
  it("is false when either credential is missing", () => {
    expect(hasUpstashCredentials({})).toBe(false);
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" })).toBe(
      false,
    );
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_TOKEN: "token" })).toBe(false);
  });

  it("is true when both credentials are present", () => {
    expect(
      hasUpstashCredentials({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toBe(true);
  });
});

describe("createRateLimiter — fail-open path (no credentials)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always allows requests and never throws when Upstash credentials are absent", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limiter = createRateLimiter({ limit: 5, windowSeconds: 60 }, {});

    for (let i = 0; i < 20; i++) {
      const outcome = await limiter.limit("same-caller");
      expect(outcome.success).toBe(true);
    }

    expect(warnSpy).toHaveBeenCalled();
  });

  it("reports the configured limit on the fail-open outcome", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limiter = createRateLimiter({ limit: 42, windowSeconds: 60 }, {});
    const outcome = await limiter.limit("caller");
    expect(outcome.limit).toBe(42);
  });
});
