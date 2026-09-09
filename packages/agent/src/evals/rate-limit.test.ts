import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { ChatModel } from "../model-provider.js";
import {
  apiErrorStatusCode,
  classifyQuotaEvidence,
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

/** A real DAILY-cap 429 body (#141's documented real quotaId) — never retried by policy. */
const DAILY_QUOTA_BODY = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      },
    ],
  },
});

/** Ambiguous: both a minute and a daily violation named in the same response. */
const MIXED_QUOTA_BODY = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          { quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" },
          { quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" },
        ],
      },
    ],
  },
});

/** A QuotaFailure whose violation names neither a minute nor a daily quota. */
const UNKNOWN_QUOTA_BODY = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "SomeOtherQuota-FreeTier" }],
      },
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

describe("apiErrorStatusCode", () => {
  it("reads the status code off a wrapped APICallError (#307 C5 — shared with the retry-policy module)", () => {
    expect(apiErrorStatusCode(rateLimitError({}))).toBe(429);
    expect(
      apiErrorStatusCode(
        new APICallError({
          message: "Bad Gateway",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 502,
        }),
      ),
    ).toBe(502);
  });

  it("returns undefined for a non-API error or no error at all", () => {
    expect(apiErrorStatusCode(new Error("plain"))).toBeUndefined();
    expect(apiErrorStatusCode(undefined)).toBeUndefined();
  });

  it("looks through a wrapping error's cause chain", () => {
    const wrapped = new Error("agent step failed", {
      cause: new APICallError({
        message: "Bad Gateway",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 502,
      }),
    });
    expect(apiErrorStatusCode(wrapped)).toBe(502);
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

describe("classifyQuotaEvidence (#307 options 1+2)", () => {
  it("identifies an unambiguous per-minute quota violation", () => {
    expect(classifyQuotaEvidence(rateLimitError({ responseBody: GEMINI_429_BODY }))).toBe(
      "per-minute",
    );
  });

  it("identifies a daily quota violation", () => {
    expect(classifyQuotaEvidence(rateLimitError({ responseBody: DAILY_QUOTA_BODY }))).toBe("daily");
  });

  it("classifies a response naming both a minute and a daily violation as mixed — never retryable", () => {
    expect(classifyQuotaEvidence(rateLimitError({ responseBody: MIXED_QUOTA_BODY }))).toBe("mixed");
  });

  it("classifies a QuotaFailure whose violation names neither quota as unknown", () => {
    expect(classifyQuotaEvidence(rateLimitError({ responseBody: UNKNOWN_QUOTA_BODY }))).toBe(
      "unknown",
    );
  });

  it("classifies a body with no QuotaFailure detail, an unparseable body, no body at all, or a non-API error as malformed", () => {
    expect(classifyQuotaEvidence(rateLimitError({}))).toBe("malformed");
    expect(classifyQuotaEvidence(rateLimitError({ responseBody: "not json" }))).toBe("malformed");
    expect(
      classifyQuotaEvidence(rateLimitError({ responseBody: JSON.stringify({ error: {} }) })),
    ).toBe("malformed");
    expect(
      classifyQuotaEvidence(
        rateLimitError({ responseBody: JSON.stringify({ error: { details: [] } }) }),
      ),
    ).toBe("malformed");
    expect(classifyQuotaEvidence(new Error("plain"))).toBe("malformed");
  });
});

describe("createRequestRateLimiter observability (onRequest, #307 options 1+2)", () => {
  it("reports admission/send/completion UTC timestamps, wait duration, window count and a request identity for a successful request", async () => {
    const clock = createFakeClock();
    const onRequest = vi.fn();
    const limiter = createRequestRateLimiter({
      rpmLimit: 2,
      now: clock.now,
      sleep: clock.sleep,
      onRequest,
    });

    await limiter.run(async () => {
      clock.advance(50);
      return "ok";
    });

    expect(onRequest).toHaveBeenCalledTimes(1);
    const record = onRequest.mock.calls[0]?.[0];
    expect(record).toMatchObject({
      requestId: 0,
      outcome: "success",
      waitMs: 0,
      windowCount: 1,
      effectiveRpm: 1,
    });
    expect(record.admittedAt).toBe(new Date(1_000_000).toISOString());
    expect(record.sendAt).toBe(record.admittedAt);
    expect(record.completedAt).toBe(new Date(1_000_050).toISOString());
  });

  it("reports a positive waitMs, a distinct requestId and windowCount when a second request has to wait for a slot", async () => {
    const clock = createFakeClock();
    const onRequest = vi.fn();
    const limiter = createRequestRateLimiter({
      rpmLimit: 1,
      now: clock.now,
      sleep: clock.sleep,
      onRequest,
    });

    await limiter.run(async () => "first");
    await limiter.run(async () => "second");

    expect(onRequest).toHaveBeenCalledTimes(2);
    const second = onRequest.mock.calls[1]?.[0];
    expect(second.requestId).toBe(1);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(second.windowCount).toBe(1);
  });

  it("gives a retried attempt its own requestId and its own admission timing — never mislabels the retry's wait as the first attempt's send time", async () => {
    const clock = createFakeClock();
    const onRequest = vi.fn();
    const limiter = createRequestRateLimiter({
      rpmLimit: 10,
      maxRetries: 1,
      now: clock.now,
      sleep: clock.sleep,
      onRequest,
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError({ responseHeaders: { "retry-after": "1" } }))
      .mockResolvedValue("ok");

    await limiter.run(operation);

    expect(onRequest).toHaveBeenCalledTimes(2);
    const [first, retried] = onRequest.mock.calls.map((call) => call[0]);
    expect(first.requestId).not.toBe(retried.requestId);
    expect(first.outcome).toBe("error");
    expect(retried.outcome).toBe("success");
    expect(Date.parse(retried.admittedAt) - Date.parse(first.admittedAt)).toBe(1_000);
  });

  it("captures a sanitized quota classification and provider retry hint on a 429, never the raw body/header", async () => {
    const clock = createFakeClock();
    const onRequest = vi.fn();
    const limiter = createRequestRateLimiter({
      rpmLimit: 10,
      maxRetries: 0,
      now: clock.now,
      sleep: clock.sleep,
      onRequest,
    });
    const error = rateLimitError({ responseBody: GEMINI_429_BODY });

    await expect(limiter.run(vi.fn().mockRejectedValue(error))).rejects.toThrow();

    const record = onRequest.mock.calls[0]?.[0];
    expect(record).toMatchObject({
      outcome: "error",
      statusCode: 429,
      quotaClassification: "per-minute",
      retryHintMs: 1_500,
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("GenerateRequestsPerMinute");
    expect(serialized).not.toContain(GEMINI_429_BODY);
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
