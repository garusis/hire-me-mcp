import { Agent } from "@mastra/core/agent";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createRateLimitedModel, createRequestRateLimiter } from "./rate-limit.js";
import {
  classifyProviderError,
  createRetryingModel,
  createRetryPolicy,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_PHASE_MS,
  DEFAULT_MAX_REQUEST_MS,
  DeadlineExceededError,
  isTransientProviderError,
  RETRY_BACKOFF_STEPS_MS,
  RETRY_JITTER_MAX_MS,
  redactSecrets,
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
  responseBody?: string;
}): APICallError {
  return new APICallError({
    message: `HTTP ${options.statusCode}`,
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
    requestBodyValues: {},
    statusCode: options.statusCode,
    isRetryable: true,
    responseHeaders: options.responseHeaders,
    responseBody: options.responseBody,
  });
}

/** A real per-minute-quota 429 body (#307 options 1+2) — the ONLY classification this policy may retry. */
const MINUTE_QUOTA_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
      },
    ],
  },
});

/** A real daily-quota 429 body (#141's documented real quotaId) — never retried. */
const DAILY_QUOTA_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      },
    ],
  },
});

/** Ambiguous: both a minute and a daily violation in the same response — never retried. */
const MIXED_QUOTA_BODY = JSON.stringify({
  error: {
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

/** A QuotaFailure whose violation names neither a minute nor a daily quota — never retried. */
const UNKNOWN_QUOTA_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "SomeOtherQuota-FreeTier" }],
      },
    ],
  },
});

/**
 * A real minute quotaId named under a detail whose `@type` merely CONTAINS
 * "QuotaFailure" as a substring of an unrelated type name, plus a SECOND,
 * exact-type `QuotaFailure` detail whose `violations` field isn't an array
 * (`"bad"`) — second independent Codex review (issuecomment-5608823305),
 * finding 1's full-policy repro: neither the lookalike `@type` nor the
 * malformed sibling detail may let this resolve to `"per-minute"`; the
 * whole response must classify as `"malformed"` and stop, all the way
 * through `createRetryPolicy`, not only `classifyQuotaEvidence` in
 * isolation.
 */
const LOOKALIKE_PLUS_MALFORMED_QUOTA_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/some.unrelatedQuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
      },
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: "bad",
      },
    ],
  },
});

/** A real minute quotaId paired with a non-string quotaMetric — third independent Codex review (issuecomment-5620134895), finding 1: malformed/untrustworthy evidence, never per-minute. */
const MINUTE_QUOTA_ID_NUMERIC_METRIC_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          { quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaMetric: 123 },
        ],
      },
    ],
  },
});

/** A real minute quotaId paired with the TOKEN-quota metric string — inconsistent evidence (third independent Codex review, finding 1), never per-minute. */
const MINUTE_QUOTA_ID_TOKEN_METRIC_BODY = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            quotaMetric:
              "generativelanguage.googleapis.com/generate_content_free_tier_input_token_count",
          },
        ],
      },
    ],
  },
});

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

/**
 * #307 eval-deadline correction (Track A): issuecomment-5622472018's CI
 * evidence showed a real `DeadlineExceededError` (this run's own shared
 * deadline elapsing, never a provider response) reaching
 * `classifyProviderError` and falling into the SAME `"unknown-error"` /
 * `UnknownError` / "Non-provider error" bucket a genuinely unclassifiable
 * error gets — misattributing "our own run/request timeout stopped this" to
 * an unknown provider failure. Direct unit coverage of the classifier
 * itself, distinct from `cli.test.ts`'s `describeCaseFailure` coverage of
 * the same boundary at the case-report layer.
 */
describe("classifyProviderError", () => {
  it("classifies a bare DeadlineExceededError as its own distinct classification — never unknown-error", () => {
    const error = new DeadlineExceededError("Deadline exceeded while the request was in flight");
    const result = classifyProviderError(error);
    expect(result.classification).toBe("local-deadline-exceeded");
    expect(result.errorName).toBe("DeadlineExceededError");
    expect(result.errorMessage).not.toBe("Non-provider error");
    expect(result.statusCode).toBeUndefined();
  });

  it("classifies a DeadlineExceededError wrapped in another error's .cause the same way ('including wrapped errors')", () => {
    const inner = new DeadlineExceededError("Deadline exceeded before attempt 1 could start");
    const outer = new Error("wrapped", { cause: inner });
    const result = classifyProviderError(outer);
    expect(result.classification).toBe("local-deadline-exceeded");
    expect(result.errorName).toBe("DeadlineExceededError");
  });

  it("still classifies a genuine provider status code normally — the deadline check never shadows a real API error", () => {
    const result = classifyProviderError(apiError({ statusCode: 503 }));
    expect(result.classification).toBe("transient-provider-error");
    expect(result.errorName).toBe("TransientProviderError");
  });

  it("still falls back to unknown-error for a plain, non-deadline, non-API error", () => {
    const result = classifyProviderError(new Error("boom"));
    expect(result.classification).toBe("unknown-error");
    expect(result.errorName).toBe("UnknownError");
    expect(result.errorMessage).toBe("Non-provider error");
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

  it("stops immediately on a 429 with no structured quota evidence at all — this policy never guesses", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429 });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        outcome: "stopped-rate-limited",
        statusCode: 429,
        quotaClassification: "malformed",
      }),
    );
  });

  it("retries a 429 whose structured evidence unambiguously names a per-minute quota, honoring the Retry-After hint (#307 options 1+2)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: MINUTE_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");

    const startedAt = clock.now();
    await expect(policy.run(operation)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(clock.now() - startedAt).toBe(2_000);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        outcome: "retrying",
        quotaClassification: "per-minute",
        retryHintMs: 2_000,
      }),
    );
  });

  it("records the sanitized provider retry hint on a 429 attempt even when the attempt stops (never just on a retried one)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "9" },
      responseBody: DAILY_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "stopped-rate-limited", retryHintMs: 9_000 }),
    );
  });

  it("omits retryHintMs on a 429 with no trustworthy hint", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429, responseBody: MINUTE_QUOTA_BODY });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    const record = onAttempt.mock.calls[0]?.[0];
    expect(record.retryHintMs).toBeUndefined();
  });

  it("stops immediately on a 429 with daily quota evidence, even though a Retry-After hint is present", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: DAILY_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "stopped-rate-limited", quotaClassification: "daily" }),
    );
  });

  it("stops immediately on a 429 with mixed daily+minute quota evidence — never treated as unambiguous", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: MIXED_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "stopped-rate-limited", quotaClassification: "mixed" }),
    );
  });

  it("stops immediately on a 429 whose quota evidence names neither a minute nor a daily quota (unknown)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: UNKNOWN_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "stopped-rate-limited", quotaClassification: "unknown" }),
    );
  });

  it("stops immediately, through the FULL policy (not only the classifier), on a 429 whose quota evidence is a lookalike @type plus a malformed sibling detail (second independent Codex review, finding 1)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: LOOKALIKE_PLUS_MALFORMED_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "stopped-rate-limited",
        quotaClassification: "malformed",
      }),
    );
  });

  it("stops immediately, through the FULL policy, on a real minute quotaId paired with a non-string quotaMetric — never retried even with a valid retry hint present (third independent Codex review, finding 1)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: MINUTE_QUOTA_ID_NUMERIC_METRIC_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    // A valid Retry-After hint (2s) is present, proving the stop is driven
    // by the malformed quotaMetric evidence, not by a missing hint.
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "stopped-rate-limited",
        quotaClassification: "malformed",
        retryHintMs: 2_000,
      }),
    );
  });

  it("stops immediately, through the FULL policy, on a real minute quotaId paired with the TOKEN-quota metric string — never retried even with a valid retry hint present (third independent Codex review, finding 1)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      responseBody: MINUTE_QUOTA_ID_TOKEN_METRIC_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "stopped-rate-limited",
        quotaClassification: "malformed",
        retryHintMs: 2_000,
      }),
    );
  });

  it("stops a per-minute 429 rather than inventing a fallback backoff when no Retry-After/RetryInfo hint is present", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429, responseBody: MINUTE_QUOTA_BODY });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "stopped-rate-limited",
        quotaClassification: "per-minute",
      }),
    );
  });

  it("stops a per-minute 429 at the existing maxAttempts bound, same as any other retried error", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "1" },
      responseBody: MINUTE_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(onAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: DEFAULT_MAX_ATTEMPTS,
        outcome: "stopped-retries-exhausted",
        quotaClassification: "per-minute",
      }),
    );
  });

  it("stops a per-minute 429 when honoring the hint would exceed the deadline — never retries earlier than the hint", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      maxRequestMs: 1_000,
      onAttempt,
    });
    const error = apiError({
      statusCode: 429,
      responseHeaders: { "retry-after": "5" },
      responseBody: MINUTE_QUOTA_BODY,
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "stopped-deadline-exceeded",
        quotaClassification: "per-minute",
      }),
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

  /**
   * #307 second independent-review correction, finding 1: a `Retry-After`
   * hint that does not fit the remaining deadline must STOP the request, not
   * fall back to a shorter, arbitrary backoff step — retrying at 10s when
   * the provider explicitly asked for 3600s would retry earlier than the
   * provider's own hint, which this policy must never do.
   */
  it("stops rather than retrying early when a Retry-After hint would exceed the per-request deadline — never substitutes a shorter arbitrary backoff", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      maxRequestMs: 12_000,
      onAttempt,
    });
    const error = apiError({ statusCode: 503, responseHeaders: { "retry-after": "3600" } });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(policy.run(operation)).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-deadline-exceeded" }),
    );
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

  it("records the statusCode plus a controlled classification on a stopped attempt — never the raw error's own name/message", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = apiError({ statusCode: 429 });

    await expect(policy.run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);

    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        errorName: "RateLimitError",
        errorMessage: "HTTP 429",
      }),
    );
  });

  /**
   * #307 second independent-review correction, finding 1: a phase deadline
   * already in the past when `run()` is invoked (not just crossed mid-run)
   * must stop BEFORE issuing any request — reproduced directly: a policy
   * built with a near-zero phase budget, invoked after the clock has moved
   * past it, must never call `operation` at all.
   */
  it("never calls operation when the deadline has already passed before run() is invoked (preflight recheck)", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      maxPhaseMs: 10,
      maxRequestMs: 10,
      onAttempt,
    });
    clock.advance(100);
    const operation = vi.fn().mockResolvedValue("ok");

    await expect(policy.run(operation)).rejects.toThrow(DeadlineExceededError);

    expect(operation).not.toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-deadline-exceeded" }),
    );
  });

  /**
   * #307 second independent-review correction, finding 1: an in-flight
   * operation must be abortable and bounded — a hung request must not be
   * allowed to run past the deadline. `run()` passes an `AbortSignal` to
   * `operation` and aborts it once the deadline elapses mid-attempt, using
   * only the injected fake clock (no real timers).
   */
  it("aborts and stops an in-flight operation once the deadline elapses mid-attempt, never waiting past it", async () => {
    vi.useFakeTimers();
    try {
      const clock = createFakeClock();
      const onAttempt = vi.fn();
      const policy = createRetryPolicy({
        now: clock.now,
        sleep: clock.sleep,
        maxRequestMs: 5_000,
        onAttempt,
      });
      let receivedSignal: AbortSignal | undefined;
      const operation = vi.fn((signal: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<never>(() => {}); // a hung request that never resolves on its own
      });

      const runPromise = policy.run(operation);
      const assertion = expect(runPromise).rejects.toThrow(DeadlineExceededError);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;

      expect(receivedSignal?.aborted).toBe(true);
      expect(onAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "stopped-deadline-exceeded" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("never retries after a deadline-exceeded stop", async () => {
    vi.useFakeTimers();
    try {
      const clock = createFakeClock();
      const policy = createRetryPolicy({
        now: clock.now,
        sleep: clock.sleep,
        maxRequestMs: 1_000,
      });
      const operation = vi.fn(() => new Promise<never>(() => {}));

      const runPromise = policy.run(operation);
      const assertion = expect(runPromise).rejects.toThrow(DeadlineExceededError);
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;

      expect(operation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * #307 second independent-review correction (2nd round), finding 1: regex
   * redaction of a free-text provider error message is an unsafe allowlist —
   * it missed a fake secret embedded WITHOUT a query-string/header context
   * (e.g. `token=...` with no leading `?`/`&`) and never touched
   * `error.name` at all. The fix is not "redact harder" — it's to never
   * persist the raw text in the first place. Reproduced with the reviewer's
   * own adversarial example.
   */
  it("never persists the raw error message or name — only a controlled classification and statusCode — even for text no redaction regex would catch", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = new Error("token=FAKE_SECRET_FOR_TEST payload: PRIVATE_BODY_EXAMPLE");
    error.name = "PRIVATE_NAME_EXAMPLE";

    await expect(policy.run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);

    const record = onAttempt.mock.calls[0]?.[0];
    expect(JSON.stringify(record)).not.toContain("FAKE_SECRET_FOR_TEST");
    expect(JSON.stringify(record)).not.toContain("PRIVATE_BODY_EXAMPLE");
    expect(JSON.stringify(record)).not.toContain("PRIVATE_NAME_EXAMPLE");
    expect(record.errorName).toBe("UnknownError");
    expect(record.errorMessage).toBe("Non-provider error");
  });

  it("classifies a query-string-shaped error message without leaking any of its text", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = new Error(
      "request to https://api.example.test/v1/models?key=FAKE_SECRET_FOR_TEST failed",
    );

    await expect(policy.run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);

    const record = onAttempt.mock.calls[0]?.[0];
    expect(record.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
    expect(record.errorMessage).toBe("Non-provider error");
  });

  it("classifies a bearer/authorization-shaped error message without leaking any of its text", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, onAttempt });
    const error = new Error("auth failed: Authorization: Bearer FAKE_SECRET_FOR_TEST");

    await expect(policy.run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);

    const record = onAttempt.mock.calls[0]?.[0];
    expect(record.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
  });

  /**
   * #307 second independent-review correction (2nd round), finding 2:
   * budget must be enforced BEFORE every provider request — including
   * retries of the same logical request, not just once per case after it
   * completes. `beforeAttempt` is the shared hook a caller (`./cli.ts`)
   * wires to a budget tracker; once it throws, no further attempt is made
   * and the throw is recorded as `"stopped-budget-exceeded"`.
   */
  it("checks beforeAttempt before every attempt and stops immediately, recording 'stopped-budget-exceeded', once it throws", async () => {
    const clock = createFakeClock();
    const onAttempt = vi.fn();
    let exhausted = false;
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      onAttempt,
      beforeAttempt: () => {
        if (exhausted) throw new Error("budget exceeded");
      },
    });
    const operation = vi.fn().mockResolvedValue("ok");

    await expect(policy.run(operation)).resolves.toBe("ok");
    exhausted = true;
    await expect(policy.run(operation)).rejects.toThrow("budget exceeded");

    expect(operation).toHaveBeenCalledTimes(1); // never called for the second, budget-blocked run()
    expect(onAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 1, outcome: "stopped-budget-exceeded" }),
    );
  });

  it("never calls beforeAttempt when it is not provided", async () => {
    const clock = createFakeClock();
    const policy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });

    await expect(policy.run(vi.fn().mockResolvedValue("ok"))).resolves.toBe("ok");
  });

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3:
   * `beforeAttempt` must receive the attempt number it's about to gate —
   * captured BEFORE `operation()` runs — so a caller (`./cli.ts`) can stamp
   * a request/attempt identity ahead of the actual provider send, letting
   * that identity join deterministically against the limiter's own
   * admission telemetry recorded once the request goes through.
   */
  it("passes the current attempt number to beforeAttempt, before every attempt including retries", async () => {
    const clock = createFakeClock();
    const seenAttempts: number[] = [];
    const policy = createRetryPolicy({
      now: clock.now,
      sleep: clock.sleep,
      beforeAttempt: (attempt) => seenAttempts.push(attempt),
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError({ statusCode: 503 }))
      .mockResolvedValue("ok");

    await policy.run(operation);

    expect(seenAttempts).toEqual([1, 2]);
  });
});

describe("redactSecrets", () => {
  it("redacts key/token/secret/password query params, case-insensitively", () => {
    expect(redactSecrets("https://x.test?api_key=FAKE_SECRET_FOR_TEST&foo=bar")).toBe(
      "https://x.test?api_key=[REDACTED]&foo=bar",
    );
  });

  it("redacts an Authorization header value and a bearer token", () => {
    const redacted = redactSecrets("Authorization: Bearer FAKE_SECRET_FOR_TEST");
    expect(redacted).not.toContain("FAKE_SECRET_FOR_TEST");
  });

  it("leaves ordinary error text untouched", () => {
    expect(redactSecrets("Service Unavailable")).toBe("Service Unavailable");
  });
});

describe("sumKnownUsage", () => {
  it("sums usage across attempts with known usage and marks it complete when EVERY attempt (ignoring 'unknown' ones is not enough) actually carried known usage", () => {
    const total = sumKnownUsage([
      {
        attempt: 1,
        outcome: "success",
        durationMs: 1,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      {
        attempt: 2,
        outcome: "success",
        durationMs: 1,
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
    ]);

    expect(total).toEqual({
      usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
      complete: true,
    });
  });

  /**
   * #307 second independent-review correction (2nd round), finding 3: the
   * prior `sumKnownUsage` silently summed only the known attempts and
   * returned that sum as if it were the whole truth — a partial-known sum
   * must never be presented as complete.
   */
  it("marks the sum as INCOMPLETE (not authoritative) when some attempts carry no known usage, while still returning the known partial sum", () => {
    const total = sumKnownUsage([
      { attempt: 1, outcome: "success", durationMs: 1, usage: "unknown" },
      {
        attempt: 2,
        outcome: "success",
        durationMs: 1,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    ]);

    expect(total).toEqual({
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      complete: false,
    });
  });

  it("returns 'unknown' usage and complete:false when no attempt carries known usage", () => {
    expect(
      sumKnownUsage([{ attempt: 1, outcome: "stopped-permanent-error", durationMs: 1 }]),
    ).toEqual({ usage: "unknown", complete: false });
  });

  it("returns 'unknown' usage and complete:false for an empty attempts list", () => {
    expect(sumKnownUsage([])).toEqual({ usage: "unknown", complete: false });
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

/**
 * #307 options 1+2, item 1: "Retries must reacquire admission." Proves the
 * real composition `./cli.ts`'s `main()` builds —
 * `createRetryingModel({ model: createRateLimitedModel({ model, limiter }),
 * retryPolicy })` — actually sends a retried per-minute-429 attempt back
 * through the SAME shared limiter for its own window slot, rather than
 * bypassing it, using the limiter's own `onRequest` observability hook to
 * count real admissions.
 */
describe("retry re-acquires the shared limiter's admission on every attempt (#307 options 1+2)", () => {
  const callOptions = {
    prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }] }],
  };

  function generateResult(text: string) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    };
  }

  it("admits the failed attempt AND the retried attempt as two separate limiter requests", async () => {
    const clock = createFakeClock();
    const admittedRequestIds: number[] = [];
    const limiter = createRequestRateLimiter({
      rpmLimit: 10,
      maxRetries: 0,
      now: clock.now,
      sleep: clock.sleep,
      onRequest: (record) => admittedRequestIds.push(record.requestId),
    });
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep });

    let calls = 0;
    const inner = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) {
          throw new APICallError({
            message: "Too Many Requests",
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            responseHeaders: { "retry-after": "1" },
            responseBody: JSON.stringify({
              error: {
                details: [
                  {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    violations: [
                      { quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" },
                    ],
                  },
                ],
              },
            }),
          });
        }
        return generateResult("recovered");
      },
    });
    const rateLimited = createRateLimitedModel({ model: inner, limiter });
    const model = createRetryingModel({ model: rateLimited, retryPolicy });

    const result = await model.doGenerate(callOptions);

    expect(calls).toBe(2);
    expect(result.content).toEqual([{ type: "text", text: "recovered" }]);
    // Two distinct real requests were admitted through the limiter — the
    // retry did not bypass it and reuse the first attempt's slot.
    expect(admittedRequestIds).toEqual([0, 1]);
  });
});

/**
 * #307 second independent-review correction, finding 2: "Nested Mastra
 * retries are not proven disabled" — the prior test suite only asserted
 * that `createRunCase` calls `agent.generate(question, { modelSettings: { maxRetries: 0 } })`
 * with a FAKE `generate` function, which proves nothing about whether the
 * installed `@mastra/core` `Agent` (backed by the real AI SDK `generateText`
 * call, which has its OWN `p-retry`-based retry reading `maxRetries`) still
 * retries underneath this module's policy. This suite wires a REAL Mastra
 * `Agent` around a `createRetryingModel`-wrapped `MockLanguageModelV4` — the
 * exact composition `./cli.ts`'s `main()` builds — and counts the actual
 * number of `doGenerate` calls the fake provider observed, proving there is
 * no nested layer inflating it.
 */
describe("createRetryingModel wired into a real Mastra Agent — nested-retry proof (#307 second correction, finding 2)", () => {
  function generateResult(text: string) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    };
  }

  function buildAgent(doGenerate: () => Promise<unknown>) {
    const clock = createFakeClock();
    const retryPolicy = createRetryPolicy({ now: clock.now, sleep: clock.sleep, random: () => 0 });
    const inner = new MockLanguageModelV4({ doGenerate: doGenerate as never });
    const model = createRetryingModel({ model: inner, retryPolicy });
    const agent = new Agent({
      id: "test-agent",
      name: "Test Agent",
      instructions: "test",
      model,
    });
    return agent;
  }

  it("makes AT MOST 3 real provider requests for a 503 that recovers on the 3rd attempt — no nested retry layer inflates it", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      if (calls < 3) {
        throw new APICallError({
          message: "Service Unavailable",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        });
      }
      return generateResult("recovered");
    };
    const agent = buildAgent(doGenerate);

    const result = await agent.generate("hello", { modelSettings: { maxRetries: 0 } });

    expect(result.text).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("makes EXACTLY 1 real provider request for a 429 — never retried by any layer", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      throw new APICallError({
        message: "Too Many Requests",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
      });
    };
    const agent = buildAgent(doGenerate);

    await expect(agent.generate("hello", { modelSettings: { maxRetries: 0 } })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("makes EXACTLY 1 real provider request for a permanent (400) error — never retried by any layer", async () => {
    let calls = 0;
    const doGenerate = async () => {
      calls += 1;
      throw new APICallError({
        message: "Bad Request",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
      });
    };
    const agent = buildAgent(doGenerate);

    await expect(agent.generate("hello", { modelSettings: { maxRetries: 0 } })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
