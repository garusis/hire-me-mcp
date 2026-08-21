import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_RATE_LIMIT_DEFAULTS,
  readChatRateLimitConfig,
  selectChatRateLimiters,
} from "./rate-limit";

describe("readChatRateLimitConfig", () => {
  it("defaults to the documented session and IP limits when no env overrides are set", () => {
    const config = readChatRateLimitConfig({});
    expect(config.session).toEqual(CHAT_RATE_LIMIT_DEFAULTS.session);
    expect(config.ip).toEqual(CHAT_RATE_LIMIT_DEFAULTS.ip);
  });

  it("reads CHAT_SESSION_RATELIMIT_* and CHAT_IP_RATELIMIT_* overrides independently", () => {
    const config = readChatRateLimitConfig({
      CHAT_SESSION_RATELIMIT_MAX_REQUESTS: "5",
      CHAT_SESSION_RATELIMIT_WINDOW_SECONDS: "30",
      CHAT_IP_RATELIMIT_MAX_REQUESTS: "9",
      CHAT_IP_RATELIMIT_WINDOW_SECONDS: "45",
    });
    expect(config.session).toEqual({ limit: 5, windowSeconds: 30 });
    expect(config.ip).toEqual({ limit: 9, windowSeconds: 45 });
  });

  it("falls back to the default for a malformed override rather than throwing", () => {
    const config = readChatRateLimitConfig({ CHAT_SESSION_RATELIMIT_MAX_REQUESTS: "not-a-number" });
    expect(config.session.limit).toBe(CHAT_RATE_LIMIT_DEFAULTS.session.limit);
  });
});

describe("selectChatRateLimiters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the deterministic test limiter for both session and IP when CHAT_TEST_RATE_LIMITER=1, and it actually enforces the configured limit", async () => {
    const { session, ip } = selectChatRateLimiters(
      { session: { limit: 2, windowSeconds: 60 }, ip: { limit: 5, windowSeconds: 60 } },
      { CHAT_TEST_RATE_LIMITER: "1" },
    );

    expect((await session.limit("s1")).success).toBe(true);
    expect((await session.limit("s1")).success).toBe(true);
    expect((await session.limit("s1")).success).toBe(false);

    expect((await ip.limit("i1")).success).toBe(true);
  });

  it("keeps session and IP limiter state independent of each other", async () => {
    const { session, ip } = selectChatRateLimiters(
      { session: { limit: 1, windowSeconds: 60 }, ip: { limit: 1, windowSeconds: 60 } },
      { CHAT_TEST_RATE_LIMITER: "1" },
    );

    expect((await session.limit("same-id")).success).toBe(true);
    expect((await session.limit("same-id")).success).toBe(false);
    // The IP limiter has never seen "same-id" before — its own budget is untouched.
    expect((await ip.limit("same-id")).success).toBe(true);
  });

  it("falls open (never throws, always succeeds) without Upstash credentials, same as the MCP limiter", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { session, ip } = selectChatRateLimiters(
      { session: { limit: 1, windowSeconds: 60 }, ip: { limit: 1, windowSeconds: 60 } },
      {},
    );
    expect((await session.limit("x")).success).toBe(true);
    expect((await session.limit("x")).success).toBe(true);
    expect((await ip.limit("x")).success).toBe(true);
  });
});
