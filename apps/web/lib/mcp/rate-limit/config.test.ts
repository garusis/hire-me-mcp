import { describe, expect, it } from "vitest";
import { readRateLimitConfig } from "./config";

describe("readRateLimitConfig", () => {
  it("defaults to 60 requests per 60-second window when no overrides are set", () => {
    expect(readRateLimitConfig({})).toEqual({ limit: 60, windowSeconds: 60 });
  });

  it("honors RATELIMIT_MAX_REQUESTS and RATELIMIT_WINDOW_SECONDS overrides", () => {
    expect(
      readRateLimitConfig({ RATELIMIT_MAX_REQUESTS: "5", RATELIMIT_WINDOW_SECONDS: "10" }),
    ).toEqual({ limit: 5, windowSeconds: 10 });
  });

  it("falls back to the default limit when RATELIMIT_MAX_REQUESTS is not a positive integer", () => {
    expect(readRateLimitConfig({ RATELIMIT_MAX_REQUESTS: "0" }).limit).toBe(60);
    expect(readRateLimitConfig({ RATELIMIT_MAX_REQUESTS: "-3" }).limit).toBe(60);
    expect(readRateLimitConfig({ RATELIMIT_MAX_REQUESTS: "abc" }).limit).toBe(60);
    expect(readRateLimitConfig({ RATELIMIT_MAX_REQUESTS: "1.5" }).limit).toBe(60);
  });

  it("falls back to the default window when RATELIMIT_WINDOW_SECONDS is not a positive integer", () => {
    expect(readRateLimitConfig({ RATELIMIT_WINDOW_SECONDS: "0" }).windowSeconds).toBe(60);
    expect(readRateLimitConfig({ RATELIMIT_WINDOW_SECONDS: "nope" }).windowSeconds).toBe(60);
  });
});
