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

describe("createRateLimiter — namespace prefix (#68, mocked Upstash SDK)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@upstash/redis");
    vi.doUnmock("@upstash/ratelimit");
  });

  it("gives a caller-supplied namespace its own Ratelimit key prefix, distinct from the default MCP prefix — so /api/chat (#68) can share this same Upstash-backed mechanism without its session/IP counters colliding with the MCP route's (#39)", async () => {
    vi.resetModules();
    const ctorCalls: Array<{ prefix: string }> = [];
    vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
    vi.doMock("@upstash/ratelimit", () => {
      class FakeRatelimit {
        constructor(options: { prefix: string }) {
          ctorCalls.push(options);
        }
        limit = vi.fn();
      }
      return { Ratelimit: Object.assign(FakeRatelimit, { slidingWindow: () => "sliding-window" }) };
    });

    const { createRateLimiter: createRateLimiterMocked } = await import("./limiter");
    const env = {
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    };
    createRateLimiterMocked({ limit: 5, windowSeconds: 60 }, env, "chat-session");
    createRateLimiterMocked({ limit: 5, windowSeconds: 60 }, env, "chat-ip");
    createRateLimiterMocked({ limit: 5, windowSeconds: 60 }, env);

    expect(ctorCalls[0]?.prefix).toBe("hire-me-mcp/ratelimit/chat-session");
    expect(ctorCalls[1]?.prefix).toBe("hire-me-mcp/ratelimit/chat-ip");
    expect(ctorCalls[2]?.prefix).toBe("hire-me-mcp/ratelimit");
  });
});
