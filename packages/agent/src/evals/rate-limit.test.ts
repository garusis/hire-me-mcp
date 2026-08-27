import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { ChatModel } from "../model-provider.js";
import {
  createRateLimitedModel,
  createRequestRateLimiter,
  DEFAULT_EVAL_RPM_LIMIT,
  FREE_TIER_RPM_CEILING,
  isRateLimitError,
  parseRetryAfterMs,
  RATE_LIMIT_WINDOW_MS,
  toLanguageModel,
  UnsupportedModelError,
} from "./rate-limit.js";

/**
 * A fake clock: `now()` reads virtual time, `sleep(ms)` advances it
 * instantly. Every timing assertion in this file runs against it, so the
 * suite makes zero real model calls AND never waits on a real timer.
 */
function createFakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
      await Promise.resolve();
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Assert the invariant the limiter exists for: no rolling `windowMs` window ever contains more than `limit` request timestamps. */
function expectWithinRollingWindow(
  timestamps: readonly number[],
  limit: number,
  windowMs = RATE_LIMIT_WINDOW_MS,
): void {
  for (const [index, start] of timestamps.entries()) {
    const inWindow = timestamps.filter((at) => at >= start && at < start + windowMs);
    expect(
      inWindow.length,
      `window starting at request #${index} (t=${start}) holds ${inWindow.length} requests`,
    ).toBeLessThanOrEqual(limit);
  }
}

function rateLimitError(options: {
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}): APICallError {
  return new APICallError({
    message: "Too Many Requests",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
    ...options,
  });
}

/** The real shape Gemini returns with a 429: a `RetryInfo` detail carrying `retryDelay`. */
const GEMINI_429_BODY = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1.5s" },
    ],
  },
});

describe("rate-limit constants", () => {
  it("derives the eval RPM default from the documented free-tier ceiling, with a real margin", () => {
    expect(FREE_TIER_RPM_CEILING).toBe(15);
    expect(DEFAULT_EVAL_RPM_LIMIT).toBeLessThan(FREE_TIER_RPM_CEILING);
    expect(DEFAULT_EVAL_RPM_LIMIT).toBeGreaterThan(0);
  });
});

describe("createRequestRateLimiter", () => {
  it("never exceeds the limit in any rolling 60s window, across many sequential requests", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const startedAt: number[] = [];

    for (let i = 0; i < 35; i++) {
      await limiter.run(async () => {
        startedAt.push(clock.now());
        return i;
      });
    }

    expect(startedAt).toHaveLength(35);
    expectWithinRollingWindow(startedAt, 10);
    // 35 requests at 10/min cannot possibly fit in less than two full windows.
    expect(clock.now()).toBeGreaterThanOrEqual(1_000_000 + 2 * RATE_LIMIT_WINDOW_MS);
  });

  it("counts EVERY model request a multi-request case makes, not the case (#282)", async () => {
    // The bug this module fixes: one eval case is 3 model requests (model
    // call -> tool call -> composing model call). A case-level throttle at
    // 10 "RPM" really issued 30 requests/min; a request-level one cannot.
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const startedAt: number[] = [];

    const runCase = async () => {
      for (let step = 0; step < 3; step++) {
        await limiter.run(async () => {
          startedAt.push(clock.now());
        });
      }
    };

    for (let caseIndex = 0; caseIndex < 8; caseIndex++) {
      await runCase();
    }

    expect(startedAt).toHaveLength(24);
    expectWithinRollingWindow(startedAt, 10);
  });

  it("serializes concurrent acquisitions so parallel callers cannot slip past the window", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 5, now: clock.now, sleep: clock.sleep });
    const startedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 12 }, () =>
        limiter.run(async () => {
          startedAt.push(clock.now());
        }),
      ),
    );

    expect(startedAt).toHaveLength(12);
    expectWithinRollingWindow(startedAt, 5);
  });

  it("lets a request through immediately once the oldest one has aged out of the window", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 2, now: clock.now, sleep: clock.sleep });

    await limiter.run(async () => undefined);
    await limiter.run(async () => undefined);
    const afterTwo = clock.now();

    clock.advance(RATE_LIMIT_WINDOW_MS + 1);
    await limiter.run(async () => undefined);

    // No throttle sleep was needed — the clock only moved by the advance above.
    expect(clock.now()).toBe(afterTwo + RATE_LIMIT_WINDOW_MS + 1);
  });

  it("retries a 429 that carries a retry-after header, waiting the hinted delay, and succeeds", async () => {
    const clock = createFakeClock();
    const onRetry = vi.fn();
    const limiter = createRequestRateLimiter({
      rpmLimit: 10,
      now: clock.now,
      sleep: clock.sleep,
      onRetry,
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError({ responseHeaders: { "retry-after": "1.5" } }))
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await expect(limiter.run(operation)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(clock.now() - startedAt).toBe(1_500);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, delayMs: 1_500 }));
  });

  it("reads Gemini's RetryInfo retryDelay out of the 429 body when no header is present", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError({ responseBody: GEMINI_429_BODY }))
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await expect(limiter.run(operation)).resolves.toBe("ok");

    expect(clock.now() - startedAt).toBe(1_500);
  });

  it("falls back to bounded exponential backoff when the 429 carries no retry hint", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError({}))
      .mockRejectedValueOnce(rateLimitError({}))
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await expect(limiter.run(operation)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(3);
    // Backoff grows between attempts rather than hammering at a fixed delay.
    expect(clock.now() - startedAt).toBeGreaterThan(0);
  });

  it("gives up after the retry budget rather than retrying forever, surfacing the last 429", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({
      rpmLimit: 10,
      maxRetries: 2,
      now: clock.now,
      sleep: clock.sleep,
    });
    const operation = vi.fn().mockRejectedValue(rateLimitError({}));

    await expect(limiter.run(operation)).rejects.toThrow(APICallError);
    expect(operation).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("does NOT retry a non-rate-limit API error — a genuine failure surfaces immediately", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const serverError = new APICallError({
      message: "Internal Server Error",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
      requestBodyValues: {},
      statusCode: 500,
      isRetryable: true,
    });
    const operation = vi.fn().mockRejectedValue(serverError);

    await expect(limiter.run(operation)).rejects.toThrow("Internal Server Error");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry, or swallow, an ordinary Error thrown by the operation", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 10, now: clock.now, sleep: clock.sleep });
    const operation = vi.fn().mockRejectedValue(new Error("tool blew up"));

    await expect(limiter.run(operation)).rejects.toThrow("tool blew up");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("counts a 429'd attempt against the window — a retry takes its own slot", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 2, now: clock.now, sleep: clock.sleep });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError({ responseHeaders: { "retry-after": "1" } }))
      .mockResolvedValue("ok");

    await limiter.run(operation); // consumes 2 slots: the 429'd attempt + the retry
    const beforeThird = clock.now();
    await limiter.run(async () => "third");

    // The window is already full, so the third request had to wait it out.
    expect(clock.now() - beforeThird).toBeGreaterThan(0);
  });
});

describe("isRateLimitError", () => {
  it("recognizes a 429 APICallError", () => {
    expect(isRateLimitError(rateLimitError({}))).toBe(true);
  });

  it("rejects other status codes and non-API errors", () => {
    expect(isRateLimitError(new Error("nope"))).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(
      isRateLimitError(
        new APICallError({
          message: "bad request",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 400,
        }),
      ),
    ).toBe(false);
  });

  it("looks through a wrapping error's cause chain", () => {
    const wrapped = new Error("agent step failed", { cause: rateLimitError({}) });
    expect(isRateLimitError(wrapped)).toBe(true);
  });
});

describe("parseRetryAfterMs", () => {
  it("reads a numeric retry-after header as seconds", () => {
    expect(parseRetryAfterMs(rateLimitError({ responseHeaders: { "retry-after": "2" } }))).toBe(
      2_000,
    );
  });

  it("reads Gemini's RetryInfo retryDelay string", () => {
    expect(parseRetryAfterMs(rateLimitError({ responseBody: GEMINI_429_BODY }))).toBe(1_500);
  });

  it("returns undefined when no hint is present or the body is unparseable", () => {
    expect(parseRetryAfterMs(rateLimitError({}))).toBeUndefined();
    expect(parseRetryAfterMs(rateLimitError({ responseBody: "not json" }))).toBeUndefined();
    expect(parseRetryAfterMs(new Error("plain"))).toBeUndefined();
  });
});

describe("toLanguageModel", () => {
  it("returns a real language model instance unchanged", () => {
    const model = new MockLanguageModelV4({});
    expect(toLanguageModel(model)).toBe(model);
  });

  it("fails loudly on a model-router id string rather than running unthrottled", () => {
    expect(() => toLanguageModel("openai/gpt-5" as ChatModel)).toThrow(UnsupportedModelError);
  });
});

describe("createRateLimitedModel", () => {
  function countingModel(onCall: () => void): MockLanguageModelV4 {
    return new MockLanguageModelV4({
      doGenerate: async () => {
        onCall();
        return {
          content: [{ type: "text" as const, text: "hi" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
  }

  const callOptions = {
    prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }] }],
  };

  it("routes every doGenerate call through the limiter, keeping the rolling window intact", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 3, now: clock.now, sleep: clock.sleep });
    const startedAt: number[] = [];
    const model = createRateLimitedModel({
      model: countingModel(() => startedAt.push(clock.now())),
      limiter,
    });

    for (let i = 0; i < 7; i++) {
      await model.doGenerate(callOptions);
    }

    expect(startedAt).toHaveLength(7);
    expectWithinRollingWindow(startedAt, 3);
  });

  it("preserves the wrapped model's identity (modelId/provider) so reports stay attributable", () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 3, now: clock.now, sleep: clock.sleep });
    const inner = countingModel(() => undefined);
    const model = createRateLimitedModel({ model: inner, limiter });

    expect(model.modelId).toBe(inner.modelId);
    expect(model.provider).toBe(inner.provider);
  });

  it("retries a 429 raised by the underlying model and returns the eventual success", async () => {
    const clock = createFakeClock();
    const limiter = createRequestRateLimiter({ rpmLimit: 5, now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const flaky = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) {
          throw rateLimitError({ responseHeaders: { "retry-after": "1.5" } });
        }
        return {
          content: [{ type: "text" as const, text: "recovered" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });

    const model = createRateLimitedModel({ model: flaky, limiter });
    const result = await model.doGenerate(callOptions);

    expect(calls).toBe(2);
    expect(result.content).toEqual([{ type: "text", text: "recovered" }]);
  });
});
