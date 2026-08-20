import { afterEach, describe, expect, it, vi } from "vitest";
import { selectRateLimiter } from "./select-limiter";

describe("selectRateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the deterministic test limiter when MCP_TEST_RATE_LIMITER=1", async () => {
    const limiter = selectRateLimiter(
      { limit: 1, windowSeconds: 60 },
      { MCP_TEST_RATE_LIMITER: "1" },
    );

    const first = await limiter.limit("caller");
    const second = await limiter.limit("caller");

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });

  it("returns the fail-open limiter (never rejecting) when MCP_TEST_RATE_LIMITER is unset, absent Upstash credentials", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limiter = selectRateLimiter({ limit: 1, windowSeconds: 60 }, {});

    const first = await limiter.limit("caller");
    const second = await limiter.limit("caller");

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });

  it('ignores any value of MCP_TEST_RATE_LIMITER other than the exact string "1"', async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limiter = selectRateLimiter(
      { limit: 1, windowSeconds: 60 },
      { MCP_TEST_RATE_LIMITER: "true" },
    );

    const first = await limiter.limit("caller");
    const second = await limiter.limit("caller");

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });

  it("defaults to reading from process.env when no env argument is given", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => selectRateLimiter({ limit: 1, windowSeconds: 60 })).not.toThrow();
  });
});
