import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import {
  createRetryingModel,
  createRetryPolicy,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_PHASE_MS,
  DEFAULT_MAX_REQUEST_MS,
  isTransientProviderError,
  RETRY_BACKOFF_STEPS_MS,
  RETRY_JITTER_MAX_MS,
  sumKnownUsage,
} from "./retry.js";

/** Fake clock: `now()` reads virtual time, `sleep(ms)` advances it instantly — zero real timers. */
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

function apiError(options: {
  statusCode: number;
  responseHeaders?: Record<string, string>;
}): APICallError {
  return new APICallError({
    message: `HTTP ${options.statusCode}`,
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
    requestBodyValues: {},
    statusCode: options.statusCode,
    isRetryable: true,
    responseHeaders: options.responseHeaders,
  });
}

function timeoutError(message = "The operation timed out"): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

describe("retry constants", () => {
  it("locks the #307 C5 retry policy numbers", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(3);
    expect(RETRY_BACKOFF_STEPS_MS).toEqual([10_000, 20_000]);
    expect(RETRY_JITTER_MAX_MS).toBe(5_000);
    expect(DEFAULT_MAX_REQUEST_MS).toBe(90_000);
    expect(DEFAULT_MAX_PHASE_MS).toBe(600_000);
  });
});

describe("isTransientProviderError", () => {
  it("treats 502/503/504 as transient", () => {
    expect(isTransientProviderError(apiError({ statusCode: 502 }))).toBe(true);
    expect(isTransientProviderError(apiError({ statusCode: 503 }))).toBe(true);
    expect(isTransientProviderError(apiError({ statusCode: 504 }))).toBe(true);
  });

  it("treats a timeout-named error as transient", () => {
    expect(isTransientProviderError(timeoutError())).toBe(true);
  });

  it("treats 429 as NOT transient — it is stopped, not retried, by this policy", () => {
    expect(isTransientProviderError(apiError({ statusCode: 429 }))).toBe(false);
  });

  it("treats any other API status as permanent", () => {
    expect(isTransientProviderError(apiError({ statusCode: 400 }))).toBe(false);
    expect(isTransientProviderError(apiError({ statusCode: 500 }))).toBe(false);
  });

  it("treats an ordinary non-timeout Error as permanent", () => {
    expect(isTransientProviderError(new Error("tool blew up"))).toBe(false);
  });
});

describe("createRetryPolicy", () => {
  it("returns the operation's result on first success, recording one 'success' attempt", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const operation = vi.fn().mockResolvedValue("ok");

    await expect(policy.run(operation)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "success" }),
    );
  });

  it("retries a transient 503 with the fixed 10s/20s backoff steps and succeeds on the last attempt", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      onAttempt,
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError({ statusCode: 503 }))
      .mockRejectedValueOnce(apiError({ statusCode: 503 }))
      .mockResolvedValue("recovered");

    const startedAt = clock.now();
    await expect(policy.run(operation)).resolves.toBe("recovered");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(clock.now() - startedAt).toBe(30_000); // 10s + 20s, zero jitter
    expect(onAttempt.mock.calls.map(([r]) => r.outcome)).toEqual([
      "retrying",
      "retrying",
      "success",
    ]);
  });

  it("adds bounded jitter on top of the fixed backoff step", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, random: () => 0.5 });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError({ statusCode: 503 }))
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await policy.run(operation);

    expect(clock.now() - startedAt).toBe(10_000 + 0.5 * 5_000);
  });

  it("stops immediately on a 429 without retrying — this policy never retries a rate limit", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429 });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-rate-limited", statusCode: 429 }),
    );
  });

  it("stops immediately on a permanent (non-transient, non-429) error without retrying", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 400 });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-permanent-error" }),
    );
  });

  it("never continues past a stop — the same rejection surfaces, not a regenerated/duplicate answer", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });
    const error = new Error("tool blew up");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts transient failures, surfacing the last error as 'stopped-retries-exhausted'", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      onAttempt,
    });
    const error = apiError({ statusCode: 503 });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(onAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 3, outcome: "stopped-retries-exhausted" }),
    );
  });

  it("retries a timeout error the same as a transient 5xx", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, random: () => 0 });
    const operation = vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValue("ok");

    await expect(policy.run(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("honors a Retry-After hint that fits within the remaining deadline instead of the fixed backoff step", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, random: () => 0 });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError({ statusCode: 503, responseHeaders: { "retry-after": "5" } }))
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await policy.run(operation);

    expect(clock.now() - startedAt).toBe(5_000);
  });

  it("ignores a Retry-After hint that would exceed the per-request deadline, falling back to bounded backoff", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      maxRequestMs: 12_000,
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        apiError({ statusCode: 503, responseHeaders: { "retry-after": "3600" } }),
      )
      .mockResolvedValue("ok");

    const startedAt = clock.now();
    await policy.run(operation);

    // Falls back to the 10s scheduled step (which still fits in 12s), not the 3600s hint.
    expect(clock.now() - startedAt).toBe(10_000);
  });

  it("stops rather than sleeping past the per-request deadline, even for the fallback backoff", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      maxRequestMs: 5_000, // shorter than the fixed 10s first backoff step
      onAttempt,
    });
    const error = apiError({ statusCode: 503 });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-deadline-exceeded" }),
    );
  });

  it("shares one phase deadline across multiple run() calls from the same policy instance", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      maxPhaseMs: 15_000,
      onAttempt,
    });

    // First call succeeds outright — consumes no phase time.
    await policy.run(vi.fn().mockResolvedValue("first"));

    // Advance most of the phase budget via an unrelated wait.
    clock.advance(12_000);

    // Second call hits a transient error; its own 90s request deadline has
    // plenty of room, but only 3s of PHASE budget remains — less than the
    // 10s first backoff step — so it must stop rather than retry.
    const error = apiError({ statusCode: 503 });
    const operation = vi.fn().mockRejectedValue(error);
    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "stopped-deadline-exceeded" }),
    );
  });

  it("passes the successful result through extractUsage and records it on the attempt", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

    await policy.run(vi.fn().mockResolvedValue({ text: "hi" }), () => usage);

    expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: "success", usage }));
  });

  it("records usage as 'unknown' when no extractUsage is given", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });

    await policy.run(vi.fn().mockResolvedValue("ok"));

    expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ usage: "unknown" }));
  });

  it("records the error name/message/statusCode on a stopped attempt, sanitized to plain fields", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429 });

    await expect(policy.run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);

    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        errorName: "AI_APICallError",
        errorMessage: "HTTP 429",
      }),
    );
  });
});

describe("sumKnownUsage", () => {
  it("sums usage across attempts with known usage, ignoring 'unknown' ones", () => {
    const total = sumKnownUsage([
      { attempt: 1, outcome: "success", durationMs: 1, usage: "unknown" },
      {
        attempt: 2,
        outcome: "success",
        durationMs: 1,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      {
        attempt: 3,
        outcome: "success",
        durationMs: 1,
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
    ]);

    expect(total).toEqual({ inputTokens: 12, outputTokens: 6, totalTokens: 18 });
  });

  it("returns 'unknown' when no attempt carries known usage", () => {
    expect(sumKnownUsage([{ attempt: 1, outcome: "stopped-permanent-error", durationMs: 1 }])).toBe(
      "unknown",
    );
  });

  it("returns 'unknown' for an empty attempts list", () => {
    expect(sumKnownUsage([])).toBe("unknown");
  });
});

describe("createRetryingModel", () => {
  function countingModel(impl: () => Promise<unknown> | unknown): MockLanguageModelV4 {
    return new MockLanguageModelV4({ doGenerate: impl as never });
  }

  const callOptions = {
    prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }] }],
  };

  function generateResult(text: string, inputTokens = 1, outputTokens = 1) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: inputTokens,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
      },
      warnings: [],
    };
  }

  it("passes a successful doGenerate call straight through", async () => {
    const clock = createFakeClock();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });
    const inner = countingModel(async () => generateResult("hi"));
    const model = createRetryingModel({ model: inner, retryPolicy });

    const result = await model.doGenerate(callOptions);
    expect(result.content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("retries a transient doGenerate failure and returns the eventual success", async () => {
    const clock = createFakeClock();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, random: () => 0 });
    let calls = 0;
    const inner = countingModel(async () => {
      calls += 1;
      if (calls === 1) {
        throw new APICallError({
          message: "Bad Gateway",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 502,
          isRetryable: true,
        });
      }
      return generateResult("recovered");
    });
    const model = createRetryingModel({ model: inner, retryPolicy });

    const result = await model.doGenerate(callOptions);
    expect(calls).toBe(2);
    expect(result.content).toEqual([{ type: "text", text: "recovered" }]);
  });

  it("records real token usage on the successful attempt", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const inner = countingModel(async () => generateResult("hi", 7, 3));
    const model = createRetryingModel({ model: inner, retryPolicy });

    await model.doGenerate(callOptions);

    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "success",
        usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
      }),
    );
  });

  it("preserves the wrapped model's identity (modelId/provider)", () => {
    const clock = createFakeClock();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });
    const inner = countingModel(async () => generateResult("hi"));
    const model = createRetryingModel({ model: inner, retryPolicy });

    expect(model.modelId).toBe(inner.modelId);
    expect(model.provider).toBe(inner.provider);
  });

  it("stops immediately on a 429 from doGenerate, never retrying it", async () => {
    const clock = createFakeClock();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const inner = countingModel(async () => {
      calls += 1;
      throw new APICallError({
        message: "Too Many Requests",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
      });
    });
    const model = createRetryingModel({ model: inner, retryPolicy });

    await expect(model.doGenerate(callOptions)).rejects.toThrow("Too Many Requests");
    expect(calls).toBe(1);
  });
});
