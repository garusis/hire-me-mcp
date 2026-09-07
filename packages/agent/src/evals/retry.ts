/**
 * The single, explicit retry owner for eval provider calls (#307 C5 — see
 * the offline diagnosis, issuecomment-5575398903, section 3/4).
 *
 * ## Why this exists
 *
 * Before this module, retries happened in TWO uncoordinated, nested places:
 * Mastra's own per-step retry (silent, `p-retry`-based, defaulting to a
 * handful of attempts on any retryable AI SDK error) wrapping `./rate-
 * limit.ts`'s own 429-only retry loop. Neither layer logged an attempt, a
 * single CLI-visible failure could actually be 3-12 real provider requests,
 * and a rejection anywhere aborted `runEvalSuite` with zero record of what
 * happened. `createRetryPolicy` replaces both: it is the ONLY thing that
 * decides whether a failed provider request is retried, and every attempt
 * — success or failure — is reported through `onAttempt`, sanitized to
 * `{ attempt, outcome, durationMs, statusCode?, errorName?, errorMessage?,
 * usage? }`. Callers disable the other two layers explicitly (`./cli.ts`
 * passes `maxRetries: 0` to both the Mastra `Agent` and `./rate-limit.ts`'s
 * limiter) so nothing retries underneath this policy.
 *
 * ## What is retried, and what stops immediately
 *
 * - **429 (rate limit):** stopped immediately, never retried by this
 *   policy. The prior nested design retried 429s (up to 3x inner, up to 3x
 *   outer — 12 requests worst case for one logical call); this policy's
 *   contract is simpler and safer for a free-tier shared key: a rate limit
 *   means stop, not spend more requests hoping the quota clears mid-run.
 * - **502/503/504, or a timeout-named error:** genuinely transient —
 *   retried up to {@link DEFAULT_MAX_ATTEMPTS} total attempts (so at most 2
 *   retries), with a FIXED backoff schedule ({@link RETRY_BACKOFF_STEPS_MS}
 *   — 10s then 20s, not unboundedly doubling) plus 0-{@link
 *   RETRY_JITTER_MAX_MS} of jitter, so a burst of failures across
 *   concurrent-ish eval cases doesn't retry in lockstep.
 * - **Anything else (4xx, a plain application error):** permanent — stopped
 *   immediately. Retrying a genuine bug or bad request wastes the run's
 *   time/token budget on a request that will never succeed.
 *
 * ## Deadlines: `Retry-After` is a hint, not a blank check
 *
 * A provider's own `Retry-After` hint is honored ONLY when honoring it
 * still fits inside the smaller of two shared deadlines: {@link
 * DEFAULT_MAX_REQUEST_MS} (90s, reset per `run()` call — one logical model
 * request) and {@link DEFAULT_MAX_PHASE_MS} (10 minutes, fixed once per
 * `createRetryPolicy` instance and shared across every `run()` call made
 * through it — "the phase" being one eval suite invocation). A hint that
 * would blow either deadline, or a fallback backoff step that would, stops
 * the request rather than sleeping past its budget. This is what "stop on
 * exhaustion, never continue provider calls after stop" means in practice:
 * once `run()` rejects, the caller gets that rejection — this module never
 * retries again on its own, and never re-issues a request to regenerate an
 * answer that already completed (a rejection is exactly one attempt's
 * outcome, not evidence the whole case needs re-running).
 *
 * ## Usage accounting stays honest
 *
 * `run()`'s optional `extractUsage` callback reads real token usage off a
 * SUCCESSFUL attempt's own result; a failed attempt (retried or stopped)
 * never manufactures a usage guess and is recorded with no `usage` field.
 * {@link sumKnownUsage} sums only the attempts that did carry known usage —
 * an eval case whose model call failed after collecting zero successful
 * attempts sums to the sentinel `"unknown"`, never a fabricated zero.
 *
 * ## Testing
 *
 * `now`/`sleep`/`random` are injected (`retry.test.ts` drives all three
 * from a fake clock and a fixed PRNG), so every deadline, backoff-step and
 * classification path is proven with zero real model calls and zero real
 * timers.
 */

import { APICallError, wrapLanguageModel } from "ai";
import { apiErrorStatusCode, parseRetryAfterMs } from "./rate-limit.js";

/** Max attempts per logical model request (the initial try plus retries). */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Fixed backoff step (ms) used before the Nth retry; the last entry repeats if `maxAttempts` ever exceeds this list's length. */
export const RETRY_BACKOFF_STEPS_MS = [10_000, 20_000];

/** Upper bound of the random jitter added on top of each backoff step. */
export const RETRY_JITTER_MAX_MS = 5_000;

/** Wall-clock budget for one logical model request (one `run()` call), including every retry wait. */
export const DEFAULT_MAX_REQUEST_MS = 90_000;

/** Wall-clock budget shared across every `run()` call made through one `createRetryPolicy` instance — "the phase" (one eval suite invocation). */
export const DEFAULT_MAX_PHASE_MS = 600_000;

/** Why one attempt ended the way it did — sanitized, log-safe, never a raw provider error object. */
export type RetryAttemptOutcome =
  | "success"
  | "retrying"
  | "stopped-rate-limited"
  | "stopped-permanent-error"
  | "stopped-retries-exhausted"
  | "stopped-deadline-exceeded";

/** Real token usage, or the explicit `"unknown"` sentinel — never a fabricated zero (see module docs). */
export type AttemptUsage =
  | { inputTokens: number; outputTokens: number; totalTokens: number }
  | "unknown";

/** One attempt's sanitized, JSON-serializable record — safe to persist in an eval report (no secrets, no raw error objects). */
export interface RetryAttemptRecord {
  /** 1-based attempt number within this `run()` call. */
  attempt: number;
  outcome: RetryAttemptOutcome;
  durationMs: number;
  statusCode?: number;
  errorName?: string;
  errorMessage?: string;
  /** Present only on a `"success"` attempt (or when the caller supplies `extractUsage`); `"unknown"` when usage genuinely cannot be determined. */
  usage?: AttemptUsage;
}

/** Options for {@link createRetryPolicy}. `now`/`sleep`/`random` are the test seam. */
export interface RetryPolicyOptions {
  maxAttempts?: number;
  backoffStepsMs?: number[];
  jitterMaxMs?: number;
  /** Deadline for one logical request, reset at the start of every `run()` call. */
  maxRequestMs?: number;
  /** Deadline shared across every `run()` call from this policy instance, fixed at construction. */
  maxPhaseMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Jitter source, `[0, 1)`. Defaults to `Math.random`. */
  random?: () => number;
  /** Called after EVERY attempt (success, retry, or stop) — the sole place per-attempt telemetry is reported. */
  onAttempt?: (record: RetryAttemptRecord) => void;
}

export interface RetryPolicy {
  /**
   * Run `operation`, retrying it per this policy's rules. `extractUsage`
   * (optional) reads real usage off a successful result for {@link
   * RetryAttemptRecord.usage}; omit it when the operation's result carries
   * no usage information (e.g. a stream's initial handle).
   */
  run<T>(operation: () => PromiseLike<T>, extractUsage?: (result: T) => AttemptUsage): Promise<T>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout/i.test(error.name) || /timeout/i.test(error.message);
}

/** True only for a genuinely transient provider failure (502/503/504, or a timeout) — never for a 429 (see module docs) or any other status. */
export function isTransientProviderError(error: unknown): boolean {
  const statusCode = apiErrorStatusCode(error);
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return true;
  if (statusCode !== undefined) return false;
  return isTimeoutError(error);
}

function describeError(error: unknown): {
  errorName?: string;
  errorMessage: string;
  statusCode?: number;
} {
  const statusCode = apiErrorStatusCode(error);
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, statusCode };
  }
  return { errorMessage: String(error), statusCode };
}

/** The provider's `Retry-After` hint, but only when honoring it still lands within `deadline` — otherwise `undefined`, so the caller falls back to its own bounded backoff. */
function retryAfterWithinDeadline(
  error: unknown,
  now: () => number,
  deadline: number,
): number | undefined {
  const hinted = parseRetryAfterMs(error, now);
  if (hinted === undefined) return undefined;
  return now() + hinted <= deadline ? hinted : undefined;
}

/** Build the single retry-owner policy described in this module's docs. */
export function createRetryPolicy(options: RetryPolicyOptions = {}): RetryPolicy {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffStepsMs = options.backoffStepsMs ?? RETRY_BACKOFF_STEPS_MS;
  const jitterMaxMs = options.jitterMaxMs ?? RETRY_JITTER_MAX_MS;
  const maxRequestMs = options.maxRequestMs ?? DEFAULT_MAX_REQUEST_MS;
  const maxPhaseMs = options.maxPhaseMs ?? DEFAULT_MAX_PHASE_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  // Fixed once per policy instance — every run() call shares this budget.
  const phaseDeadline = now() + maxPhaseMs;

  function scheduledDelayMs(attempt: number): number {
    const step = backoffStepsMs[attempt - 1] ?? backoffStepsMs[backoffStepsMs.length - 1] ?? 0;
    return step + random() * jitterMaxMs;
  }

  /**
   * Decide what happens to a failed attempt: stop with a specific outcome
   * (the caller records it and re-throws `error` unchanged), or retry after
   * `delayMs`. Split out of `run` below purely to keep that function's
   * cognitive complexity under this repo's Biome limit — no behavior change
   * from the single inline version this replaces (`retry.test.ts` covers
   * every branch either way).
   */
  function decideOnFailure(
    error: unknown,
    attempt: number,
    deadline: number,
  ): { outcome: RetryAttemptOutcome; delayMs?: number } {
    const info = describeError(error);
    if (info.statusCode === 429) return { outcome: "stopped-rate-limited" };
    if (!isTransientProviderError(error)) return { outcome: "stopped-permanent-error" };
    if (attempt >= maxAttempts) return { outcome: "stopped-retries-exhausted" };

    const delayMs = retryAfterWithinDeadline(error, now, deadline) ?? scheduledDelayMs(attempt);
    if (now() + delayMs > deadline) return { outcome: "stopped-deadline-exceeded" };
    return { outcome: "retrying", delayMs };
  }

  async function run<T>(
    operation: () => PromiseLike<T>,
    extractUsage?: (result: T) => AttemptUsage,
  ): Promise<T> {
    const requestDeadline = now() + maxRequestMs;
    const deadline = Math.min(requestDeadline, phaseDeadline);

    for (let attempt = 1; ; attempt++) {
      const startedAt = now();
      try {
        const result = await operation();
        options.onAttempt?.({
          attempt,
          outcome: "success",
          durationMs: now() - startedAt,
          usage: extractUsage ? extractUsage(result) : "unknown",
        });
        return result;
      } catch (error) {
        const durationMs = now() - startedAt;
        const info = describeError(error);
        const decision = decideOnFailure(error, attempt, deadline);

        options.onAttempt?.({ attempt, outcome: decision.outcome, durationMs, ...info });
        if (decision.outcome !== "retrying") throw error;

        await sleep(decision.delayMs ?? 0);
      }
    }
  }

  return { run };
}

/** Sum every attempt's known usage; `"unknown"` when none of `attempts` carries one — never a fabricated zero (see module docs). */
export function sumKnownUsage(
  attempts: readonly RetryAttemptRecord[],
): { inputTokens: number; outputTokens: number; totalTokens: number } | "unknown" {
  const known = attempts
    .map((attempt) => attempt.usage)
    .filter((usage): usage is Exclude<AttemptUsage, "unknown"> => typeof usage === "object");
  if (known.length === 0) return "unknown";
  return known.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

/**
 * The model shapes `wrapLanguageModel` accepts/returns — re-derived here
 * (rather than imported from `./rate-limit.ts`) so this module has no
 * compile-time dependency on that module's internals, only its exported
 * `apiErrorStatusCode`/`parseRetryAfterMs` functions.
 */
type WrappableLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];
export type RetryingLanguageModel = ReturnType<typeof wrapLanguageModel>;

/** Options for {@link createRetryingModel}. */
export interface RetryingModelOptions {
  /** The model to wrap — typically `./rate-limit.ts`'s `createRateLimitedModel(...)` result, so each retry attempt takes its own rate-limiter window slot. */
  model: WrappableLanguageModel;
  /** The single retry-owner policy every request on this model goes through. */
  retryPolicy: RetryPolicy;
}

/** Read the real input/output token totals off an AI SDK `doGenerate` result, or `"unknown"` if the shape doesn't parse. */
function extractDoGenerateUsage(result: unknown): AttemptUsage {
  const usage = (result as { usage?: unknown } | null | undefined)?.usage as
    | { inputTokens?: { total?: unknown }; outputTokens?: { total?: unknown } }
    | undefined;
  const inputTokens = usage?.inputTokens?.total;
  const outputTokens = usage?.outputTokens?.total;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return "unknown";
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/**
 * Wrap a language model so every `doGenerate`/`doStream` call goes through
 * `retryPolicy` — the model-boundary hook for the single retry owner
 * described in this module's docs. `doStream`'s initial handle carries no
 * usage yet (it arrives later, from consuming the stream), so its attempts
 * are always recorded with `usage: "unknown"`.
 */
export function createRetryingModel(options: RetryingModelOptions): RetryingLanguageModel {
  const { model, retryPolicy } = options;

  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: ({ doGenerate }) => retryPolicy.run(doGenerate, extractDoGenerateUsage),
      wrapStream: ({ doStream }) => retryPolicy.run(doStream),
    },
  });
}

// Re-exported so callers that only need to detect a genuine API error's
// status code (e.g. `./runner.ts` sanitizing a rejected case) don't need a
// second import of `./rate-limit.ts` for the same cause-chain walk.
export { APICallError };
