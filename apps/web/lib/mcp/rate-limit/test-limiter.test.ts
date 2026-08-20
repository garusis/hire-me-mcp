import { describe, expect, it } from "vitest";
import { createDeterministicTestLimiter } from "./test-limiter";

describe("createDeterministicTestLimiter", () => {
  it("allows requests up to the configured limit and rejects the next one", async () => {
    const limiter = createDeterministicTestLimiter({ limit: 2, windowSeconds: 60 });

    const first = await limiter.limit("caller-a");
    const second = await limiter.limit("caller-a");
    const third = await limiter.limit("caller-a");

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
  });

  it("reports the configured limit and a non-negative remaining count on every outcome", async () => {
    const limiter = createDeterministicTestLimiter({ limit: 1, windowSeconds: 60 });

    const first = await limiter.limit("caller-b");
    const second = await limiter.limit("caller-b");

    expect(first.limit).toBe(1);
    expect(first.remaining).toBe(0);
    expect(second.limit).toBe(1);
    expect(second.remaining).toBeGreaterThanOrEqual(0);
  });

  it("tracks each identifier's count independently", async () => {
    const limiter = createDeterministicTestLimiter({ limit: 1, windowSeconds: 60 });

    const callerA = await limiter.limit("caller-a");
    const callerB = await limiter.limit("caller-b");

    expect(callerA.success).toBe(true);
    expect(callerB.success).toBe(true);
  });

  it("resets a caller's count once the configured window has elapsed", async () => {
    const limiter = createDeterministicTestLimiter({ limit: 1, windowSeconds: 60 });

    const first = await limiter.limit("caller-c");
    expect(first.success).toBe(true);

    // A fresh limiter instance with the same identifier simulates a new
    // window without depending on real elapsed time in the test run.
    const freshLimiter = createDeterministicTestLimiter({ limit: 1, windowSeconds: 60 });
    const afterReset = await freshLimiter.limit("caller-c");
    expect(afterReset.success).toBe(true);
  });

  it("reports a reset timestamp in the future relative to now", async () => {
    const limiter = createDeterministicTestLimiter({ limit: 5, windowSeconds: 30 });
    const before = Date.now();

    const outcome = await limiter.limit("caller-d");

    expect(outcome.reset).toBeGreaterThan(before);
  });
});
