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
 * - **429 (rate limit):** retried ONLY when {@link classifyQuotaEvidence}
 *   reads the provider's own structured `QuotaFailure` evidence and finds an
 *   UNAMBIGUOUS per-minute quota violation — and even then, only when a
 *   trustworthy `Retry-After`/`RetryInfo` hint is present; a per-minute 429
 *   with no hint stops conservatively rather than inventing a fallback
 *   backoff (#307 options 1+2). A daily cap, a response naming both a daily
 *   and a minute violation together, evidence that names neither, or a
 *   malformed/missing body all stop immediately, exactly like before this
 *   change — retrying against a daily/ambiguous/unknown quota cannot
 *   possibly help within this policy's own deadlines and only spends more of
 *   a free-tier allowance other surfaces (production chat, Preview) depend
 *   on. The prior, even simpler design stopped on EVERY 429 unconditionally;
 *   this is a deliberate, narrower carve-out for the one case that is both
 *   safe and likely to actually succeed — never a return to the old nested
 *   design that retried 429s from two uncoordinated layers (up to 3x inner,
 *   up to 3x outer — 12 requests worst case for one logical call).
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
import {
  apiErrorStatusCode,
  classifyQuotaEvidence,
  parseRetryAfterMs,
  type QuotaClassification,
} from "./rate-limit.js";

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
  | "stopped-deadline-exceeded"
  /**
   * A caller-supplied {@link RetryPolicyOptions.beforeAttempt} budget check
   * threw before this attempt was issued (#307 second independent-review
   * correction, 2nd round, finding 2) — no provider request was made.
   */
  | "stopped-budget-exceeded";

/**
 * Thrown by {@link RetryPolicy.run} when a request's deadline is already
 * past before it can start, or elapses while it's in flight (#307 second
 * independent-review correction, finding 1). Distinct from a provider error
 * so `run()`'s catch handler never runs it through {@link decideOnFailure}'s
 * transient/permanent/429 classification — a deadline is never retried,
 * period.
 */
export class DeadlineExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineExceededError";
  }
}

/**
 * Regex-redact secrets out of a raw error message. Kept as a general-purpose
 * text utility (and its own `describe("redactSecrets", ...)` suite below
 * keeps testing it directly) — but #307 second independent-review
 * correction (2nd round), finding 1 established that this pattern-based
 * approach is NOT a safe boundary for eval telemetry: it missed a fake
 * secret embedded without a query-string/header shape (`token=...` with no
 * leading `?`/`&`) and never touched `error.name` at all. Neither
 * {@link classifyProviderError} below (the sanitization boundary every
 * `RetryAttemptRecord`/`CaseFailureInfo`/`EvalCaseError` now goes through)
 * nor `./cli.ts`'s `describeCaseFailure` call this anymore — they never let
 * a provider's raw message/name reach persisted output at all, redacted or
 * not.
 */
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:key|token|api[_-]?key|access[_-]?token|secret|password|auth)=)[^&\s"')]+/gi;
const SECRET_HEADER_PATTERN = /((?:authorization|x-api-key|x-goog-api-key)\s*[:=]\s*)\S+/gi;
const BEARER_TOKEN_PATTERN = /(bearer\s+)\S+/gi;

export function redactSecrets(text: string): string {
  return (
    text
      .replace(SECRET_QUERY_PARAM_PATTERN, "$1[REDACTED]")
      // Bearer-token redaction runs BEFORE the header pattern: "Authorization:
      // Bearer <token>" would otherwise have its header pattern greedily
      // consume only the word "Bearer" (its `\S+` stops at the space),
      // leaving the actual token behind for a later pass to miss.
      .replace(BEARER_TOKEN_PATTERN, "$1[REDACTED]")
      .replace(SECRET_HEADER_PATTERN, "$1[REDACTED]")
  );
}

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
  /**
   * A controlled classification name (see {@link classifyProviderError}) —
   * NEVER the caught error's own `.name` (#307 second independent-review
   * correction, 2nd round, finding 1).
   */
  errorName?: string;
  /**
   * A controlled, fixed-vocabulary description derived from `statusCode`/
   * the classification — NEVER the caught error's own `.message` (same
   * finding as `errorName` above).
   */
  errorMessage?: string;
  /** Present only on a `"success"` attempt (or when the caller supplies `extractUsage`); `"unknown"` when usage genuinely cannot be determined. */
  usage?: AttemptUsage;
  /**
   * Present only when `statusCode` is 429 — the sanitized classification
   * {@link classifyQuotaEvidence} derived from the provider's own structured
   * evidence (#307 options 1+2). The single fact `decideOnFailure` uses to
   * decide whether this 429 may be retried: `"per-minute"` only.
   */
  quotaClassification?: QuotaClassification;
  /**
   * Present only when `statusCode` is 429 and the provider gave a
   * `Retry-After`/`RetryInfo` hint — the parsed value in milliseconds, NEVER
   * the raw header/body it was read from (#307 options 1+2). Recorded on
   * every 429 attempt (retried or stopped), not only a retried one, so a
   * persisted report always shows what hint (if any) the provider gave.
   */
  retryHintMs?: number;
  /**
   * A stable identity distinguishing which logical provider REQUEST (one
   * `run()` call — e.g. a multi-step case's 2nd model call) this attempt
   * belongs to, separate from `attempt`'s within-request retry count (#307
   * second independent-review correction, 2nd round, finding 3). This
   * module never sets it — `createRetryPolicy` is model-boundary-generic and
   * has no notion of "case" or "request" — it is stamped on by whoever owns
   * that mapping (`./cli.ts`'s `createCaseAttemptTracker`).
   */
  requestIndex?: number;
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
  /**
   * Optional pre-flight check invoked before EVERY attempt this policy makes
   * — the first attempt of a `run()` call AND every retry of it (#307
   * second independent-review correction, 2nd round, finding 2: budget must
   * be enforced before every provider request, not once per case after it
   * completes). Throw to stop immediately without issuing the request; the
   * throw is recorded as a `"stopped-budget-exceeded"` attempt and
   * propagates out of `run()` unchanged, the same as any other stop.
   * Receives the 1-based `attempt` number it's about to gate (second
   * independent Codex review, issuecomment-5608823305, finding 3) — read
   * BEFORE `operation()` runs, so a caller can stamp a request/attempt
   * identity ahead of the actual provider send.
   */
  beforeAttempt?: (attempt: number) => void;
}

export interface RetryPolicy {
  /**
   * Run `operation`, retrying it per this policy's rules. `operation`
   * receives an `AbortSignal` that this policy aborts the instant the
   * request/phase deadline elapses (#307 second independent-review
   * correction, finding 1) — a cooperative real operation (e.g. an AI SDK
   * `doGenerate` call given `abortSignal`) can stop promptly instead of
   * running unbounded past the deadline; a fake operation that ignores the
   * signal is unaffected (the policy still stops waiting on it and moves
   * on). `extractUsage` (optional) reads real usage off a successful result
   * for {@link RetryAttemptRecord.usage}; omit it when the operation's
   * result carries no usage information (e.g. a stream's initial handle).
   */
  run<T>(
    operation: (signal: AbortSignal) => PromiseLike<T>,
    extractUsage?: (result: T) => AttemptUsage,
  ): Promise<T>;
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

/** A small, fully controlled classification of a caught provider error — see {@link classifyProviderError}. */
export type ErrorClassification =
  | "rate-limited"
  | "transient-provider-error"
  | "timeout"
  | "permanent-provider-error"
  | "local-deadline-exceeded"
  | "unknown-error";

const ERROR_CLASSIFICATION_NAMES: Record<ErrorClassification, string> = {
  "rate-limited": "RateLimitError",
  "transient-provider-error": "TransientProviderError",
  timeout: "TimeoutError",
  "permanent-provider-error": "PermanentProviderError",
  "local-deadline-exceeded": "DeadlineExceededError",
  "unknown-error": "UnknownError",
};

function classifyStatusCode(statusCode: number | undefined): ErrorClassification | undefined {
  if (statusCode === 429) return "rate-limited";
  if (statusCode === 502 || statusCode === 503 || statusCode === 504)
    return "transient-provider-error";
  if (statusCode !== undefined) return "permanent-provider-error";
  return undefined;
}

/**
 * Walk an error's `cause` chain (bounded, same depth as `./rate-limit.ts`'s
 * `findApiCallError`) looking for a {@link DeadlineExceededError} — this
 * module's own signal that a REQUEST or PHASE deadline elapsed locally,
 * never a provider response. #307 eval-deadline correction (Track A):
 * issuecomment-5622472018's CI evidence showed a real deadline stop reach
 * `classifyProviderError` as a bare `DeadlineExceededError` (thrown directly
 * by `handleAttemptFailure` above) and get classified `"unknown-error"` —
 * the exact same bucket a genuinely unclassifiable provider error falls
 * into — so a report/CLI reader could not tell "our own run/request timeout
 * stopped this" from "the provider rejected the request for an unknown
 * reason". Checking for a WRAPPED instance too (not just a direct one) means
 * this survives a caller (e.g. a framework) rethrowing it inside another
 * error's `.cause`.
 */
function findDeadlineExceededError(error: unknown): DeadlineExceededError | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (current instanceof DeadlineExceededError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Classify a caught provider error into a small, fully controlled
 * enumeration plus its numeric HTTP status code — never the error's own raw
 * `.message`/`.name` (#307 second independent-review correction, 2nd round,
 * finding 1). A provider error's free text can embed a secret in a shape no
 * redaction regex is guaranteed to catch (see {@link redactSecrets}'s doc
 * comment for the reproduction that motivated this); the safe fix is to
 * never let that text reach a persisted/logged record in the first place —
 * only this classification, `errorName`/`errorMessage` DERIVED from it (not
 * quoted from the provider), and the plain numeric `statusCode` do. This is
 * the single sanitization boundary every `RetryAttemptRecord` (below) and
 * `./cli.ts`'s `describeCaseFailure`/`createRunCase` share.
 *
 * A {@link DeadlineExceededError} (direct or wrapped in `.cause`) is checked
 * FIRST, ahead of the statusCode/timeout branches below: it is never an
 * `APICallError` and never carries a `statusCode`, so without this check it
 * always fell through to `"unknown-error"` — see
 * {@link findDeadlineExceededError}'s doc comment (#307 eval-deadline
 * correction, Track A).
 */
export function classifyProviderError(error: unknown): {
  classification: ErrorClassification;
  errorName: string;
  errorMessage: string;
  statusCode?: number;
} {
  if (findDeadlineExceededError(error) !== undefined) {
    return {
      classification: "local-deadline-exceeded",
      errorName: ERROR_CLASSIFICATION_NAMES["local-deadline-exceeded"],
      errorMessage:
        "Local request/run deadline exceeded before completion (not a provider error or quota)",
    };
  }
  const statusCode = apiErrorStatusCode(error);
  const classification =
    classifyStatusCode(statusCode) ?? (isTimeoutError(error) ? "timeout" : "unknown-error");
  const errorMessage =
    statusCode !== undefined
      ? `HTTP ${statusCode}`
      : classification === "timeout"
        ? "Request timed out"
        : "Non-provider error";
  return {
    classification,
    errorName: ERROR_CLASSIFICATION_NAMES[classification],
    errorMessage,
    ...(statusCode !== undefined ? { statusCode } : {}),
  };
}

/**
 * Race `operation` (given an `AbortSignal`) against `remainingMs` of REAL
 * wall clock (#307 second independent-review correction, finding 1) —
 * deliberately NOT the injected virtual `now`/`sleep` seam used for backoff
 * bookkeeping elsewhere in this module: that fake clock advances the moment
 * `sleep()` is called (by design, so backoff-sequence tests don't wait in
 * real time), which would corrupt every OTHER attempt's deadline math if
 * this per-attempt timeout raced against it too. A real timer, cancelled via
 * `clearTimeout` the instant `operation` settles on its own, has no such
 * side effect — it only fires if the request genuinely runs past its
 * budget. `retry.test.ts` proves the hang-abort path with `vi.useFakeTimers`
 * (this module's timer, not the virtual clock), never a real wait.
 *
 * On a timeout, `operation`'s own signal is aborted (cooperative
 * cancellation — a real `doGenerate` call given this signal, or a fake
 * operation that reads it, can stop promptly) and the race rejects with
 * {@link DeadlineExceededError}, which `run()`'s catch handler treats as an
 * unconditional stop, never a candidate for retry classification.
 */
function raceWithDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  remainingMs: number,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineExceededError("Deadline exceeded while the request was in flight"));
    }, remainingMs);
    timer.unref?.();
    Promise.resolve(operation(controller.signal)).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
  type FailureDecision = {
    outcome: RetryAttemptOutcome;
    delayMs?: number;
    quotaClassification?: QuotaClassification;
    retryHintMs?: number;
  };

  /**
   * The 429-specific branch of {@link decideOnFailure} — split out purely to
   * keep that function's cognitive complexity under this repo's Biome
   * limit, no behavior change from the single inline version this replaces
   * (`retry.test.ts` covers every branch either way). See #307 options 1+2:
   * retry a 429 ONLY when the provider's own structured evidence
   * unambiguously names a per-minute quota — never a daily cap, a mix of
   * daily+minute in the same response, evidence that names neither, or a
   * malformed/missing body. See `classifyQuotaEvidence`'s doc comment for
   * the full enumeration.
   */
  function decideOn429Failure(error: unknown, attempt: number, deadline: number): FailureDecision {
    const quotaClassification = classifyQuotaEvidence(error);
    // Recorded on every 429 attempt regardless of outcome, not only a
    // retried one, so a persisted report always shows what hint (if any)
    // the provider gave.
    const retryHintMs = parseRetryAfterMs(error, now);
    if (quotaClassification !== "per-minute") {
      return { outcome: "stopped-rate-limited", quotaClassification, retryHintMs };
    }
    if (attempt >= maxAttempts) {
      return { outcome: "stopped-retries-exhausted", quotaClassification, retryHintMs };
    }
    // Unlike the transient-error path in `decideOnFailure`, a 429 gets NO
    // fallback backoff: without a trustworthy Retry-After/RetryInfo hint,
    // stop conservatively rather than inventing a wait the provider never
    // suggested.
    if (retryHintMs === undefined) {
      return { outcome: "stopped-rate-limited", quotaClassification };
    }
    if (now() + retryHintMs > deadline) {
      return { outcome: "stopped-deadline-exceeded", quotaClassification, retryHintMs };
    }
    return { outcome: "retrying", delayMs: retryHintMs, quotaClassification, retryHintMs };
  }

  function decideOnFailure(error: unknown, attempt: number, deadline: number): FailureDecision {
    const statusCode = apiErrorStatusCode(error);
    if (statusCode === 429) return decideOn429Failure(error, attempt, deadline);
    if (!isTransientProviderError(error)) return { outcome: "stopped-permanent-error" };
    if (attempt >= maxAttempts) return { outcome: "stopped-retries-exhausted" };

    // #307 second independent-review correction, finding 1: a provider's
    // own Retry-After hint is a wait REQUIREMENT, not a suggestion. If
    // honoring it would blow the deadline, stop — never substitute a
    // shorter, arbitrary fallback backoff that retries earlier than the
    // provider explicitly asked for. Only fall back to the fixed backoff
    // schedule when the provider gave no hint at all.
    const hinted = parseRetryAfterMs(error, now);
    const delayMs = hinted ?? scheduledDelayMs(attempt);
    if (now() + delayMs > deadline) return { outcome: "stopped-deadline-exceeded" };
    return { outcome: "retrying", delayMs };
  }

  /**
   * Run exactly one attempt: either returns `{ done: true, value }` on
   * success, or `{ done: false, delayMs }` when the caller should retry
   * after `delayMs`. Every non-retrying stop is thrown directly (a
   * `DeadlineExceededError` or the original provider error, already
   * recorded via `onAttempt`) so `run()`'s loop only ever has to handle the
   * "retry" case explicitly — split out purely to keep `run()`'s cognitive
   * complexity under this repo's Biome limit, no behavior change from the
   * single inline version this replaces.
   */
  /**
   * Handle one attempt's failure: record its sanitized `onAttempt` telemetry
   * and either return the retry instruction or throw (the caller's catch
   * already has `error` in scope via the outer try/catch, so re-throwing it
   * here surfaces unchanged). Split out of `attemptOnce` purely to keep that
   * function's cognitive complexity under this repo's Biome limit — no
   * behavior change from the single inline version this replaces
   * (`retry.test.ts` covers every branch either way).
   */
  function handleAttemptFailure(
    error: unknown,
    attempt: number,
    deadline: number,
    durationMs: number,
  ): { done: false; delayMs: number } {
    if (error instanceof DeadlineExceededError) {
      options.onAttempt?.({ attempt, outcome: "stopped-deadline-exceeded", durationMs });
      throw error;
    }

    const info = classifyProviderError(error);
    const decision = decideOnFailure(error, attempt, deadline);
    options.onAttempt?.({
      attempt,
      outcome: decision.outcome,
      durationMs,
      errorName: info.errorName,
      errorMessage: info.errorMessage,
      ...(info.statusCode !== undefined ? { statusCode: info.statusCode } : {}),
      ...(decision.quotaClassification !== undefined
        ? { quotaClassification: decision.quotaClassification }
        : {}),
      ...(decision.retryHintMs !== undefined ? { retryHintMs: decision.retryHintMs } : {}),
    });
    if (decision.outcome !== "retrying") throw error;

    return { done: false, delayMs: decision.delayMs ?? 0 };
  }

  async function attemptOnce<T>(
    operation: (signal: AbortSignal) => PromiseLike<T>,
    extractUsage: ((result: T) => AttemptUsage) | undefined,
    attempt: number,
    deadline: number,
  ): Promise<{ done: true; value: T } | { done: false; delayMs: number }> {
    const startedAt = now();
    try {
      const result = await raceWithDeadline(operation, deadline - now());
      options.onAttempt?.({
        attempt,
        outcome: "success",
        durationMs: now() - startedAt,
        usage: extractUsage ? extractUsage(result) : "unknown",
      });
      return { done: true, value: result };
    } catch (error) {
      return handleAttemptFailure(error, attempt, deadline, now() - startedAt);
    }
  }

  async function run<T>(
    operation: (signal: AbortSignal) => PromiseLike<T>,
    extractUsage?: (result: T) => AttemptUsage,
  ): Promise<T> {
    const requestDeadline = now() + maxRequestMs;
    const deadline = Math.min(requestDeadline, phaseDeadline);

    for (let attempt = 1; ; attempt++) {
      // #307 second independent-review correction, finding 1: recheck the
      // deadline BEFORE issuing a request, every attempt — not just after a
      // failure. A deadline already passed (e.g. a near-exhausted phase
      // budget shared with earlier `run()` calls) must never let a first
      // attempt through.
      if (now() >= deadline) {
        options.onAttempt?.({ attempt, outcome: "stopped-deadline-exceeded", durationMs: 0 });
        throw new DeadlineExceededError(
          `Deadline exceeded before attempt ${attempt} could start — no request issued`,
        );
      }

      if (options.beforeAttempt) {
        try {
          options.beforeAttempt(attempt);
        } catch (error) {
          options.onAttempt?.({ attempt, outcome: "stopped-budget-exceeded", durationMs: 0 });
          throw error;
        }
      }

      const outcome = await attemptOnce(operation, extractUsage, attempt, deadline);
      if (outcome.done) return outcome.value;
      await sleep(outcome.delayMs);
    }
  }

  return { run };
}

/**
 * The result of {@link sumKnownUsage} — `usage` alone was previously
 * returned, which let a partial-known sum (some attempts had no usage)
 * silently pass as if it were the complete total (#307 second
 * independent-review correction, 2nd round, finding 3). `complete` makes
 * that distinction explicit: `true` only when EVERY attempt in the input
 * carried known usage, so a caller can keep and report the known partial sum
 * without presenting it as authoritative.
 */
export interface UsageSummary {
  /** `"unknown"` only when NO attempt carried known usage — never a fabricated zero (see module docs). */
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | "unknown";
  /** `true` iff `attempts` was non-empty and every attempt in it carried known usage. */
  complete: boolean;
}

/** Sum every attempt's known usage, and report whether that sum reflects EVERY attempt or only some of them — see {@link UsageSummary}. */
export function sumKnownUsage(attempts: readonly RetryAttemptRecord[]): UsageSummary {
  const known = attempts
    .map((attempt) => attempt.usage)
    .filter((usage): usage is Exclude<AttemptUsage, "unknown"> => typeof usage === "object");
  if (known.length === 0) return { usage: "unknown", complete: false };
  const usage = known.reduce(
    (total, u) => ({
      inputTokens: total.inputTokens + u.inputTokens,
      outputTokens: total.outputTokens + u.outputTokens,
      totalTokens: total.totalTokens + u.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  return { usage, complete: known.length === attempts.length };
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
      // #307 second independent-review correction, finding 1: call
      // `model.doGenerate`/`doStream` directly with `params` plus this
      // attempt's own `AbortSignal` (rather than the pre-bound `doGenerate`/
      // `doStream` closures, which carry no way to inject one) so a real
      // in-flight provider request is actually abortable when the retry
      // policy's deadline elapses — not just abandoned locally while the
      // real network call keeps running.
      wrapGenerate: ({ params, model: innerModel }) =>
        retryPolicy.run(
          (signal) => innerModel.doGenerate({ ...params, abortSignal: signal }),
          extractDoGenerateUsage,
        ),
      wrapStream: ({ params, model: innerModel }) =>
        retryPolicy.run((signal) => innerModel.doStream({ ...params, abortSignal: signal })),
    },
  });
}

// Re-exported so callers that only need to detect a genuine API error's
// status code (e.g. `./runner.ts` sanitizing a rejected case) don't need a
// second import of `./rate-limit.ts` for the same cause-chain walk.
export { APICallError };
