/**
 * Model-boundary request throttling for the eval suite (#282).
 *
 * ## Why this exists — the bug it fixes
 *
 * The eval runner used to sleep between eval CASES (`60_000 / rpmLimit` ms
 * before each case after the first). A case is NOT one request: a single
 * `agent.generate()` turn is a model call, then a tool call, then another
 * model call to compose the answer — 2-3 requests per case, sometimes more
 * when the model chains tools. A nominal "10 RPM" case throttle therefore
 * issued 20-30 real requests per minute, over `gemini-3.5-flash-lite`'s
 * documented free-tier ceiling of 15 RPM, and `agent-evals` failed with
 * `429 RESOURCE_EXHAUSTED` /
 * `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`.
 *
 * The fix is to throttle where the provider counts: at the MODEL boundary.
 * {@link createRateLimitedModel} wraps the AI SDK language model
 * (`wrapLanguageModel`'s `wrapGenerate`/`wrapStream` middleware hooks), so
 * EVERY real request — multi-step turns, retries, anything future code adds
 * — waits its turn in the same limiter. The limiter counts what the API
 * counts, so the configured number finally means what it says.
 *
 * ## Sliding window, not a fixed delay
 *
 * {@link createRequestRateLimiter} keeps the timestamps of the requests it
 * has admitted and only admits a new one when fewer than `rpmLimit` of them
 * fall inside the trailing {@link RATE_LIMIT_WINDOW_MS} — a true rolling
 * window, which is what a per-minute provider quota actually enforces. A
 * fixed inter-request delay would either over-throttle (spacing requests
 * evenly even when the window has room) or under-throttle (after an idle
 * gap, a burst can legitimately go through).
 *
 * Acquisitions are serialized through a promise chain, so two concurrent
 * callers can never both observe "the window has room" and slip through
 * together.
 *
 * ## 429 handling
 *
 * A rate-limit 429 is retried, bounded, rather than failing the whole run:
 * {@link parseRetryAfterMs} reads the provider's own hint (a `retry-after`
 * header, or Gemini's `RetryInfo.retryDelay` — ~1.5s in practice) and falls
 * back to bounded exponential backoff when neither is present. Only a
 * genuine rate-limit error is retried ({@link isRateLimitError} — HTTP 429,
 * looked for through an error's `cause` chain); every other failure,
 * including a 500, propagates immediately and unchanged. Retries are capped
 * at {@link DEFAULT_MAX_RATE_LIMIT_RETRIES}, so a persistently exhausted
 * quota (a DAILY cap, say) still fails loudly instead of spinning forever.
 *
 * A retried attempt takes its own slot in the window — the 429'd request
 * did reach the provider and was counted by it, so the limiter counts it
 * too. Token/cost budget accounting is unaffected: a 429 returns no usage,
 * and every attempt that does return usage is aggregated by the agent into
 * the `totalUsage` the runner tallies, so `assertWithinBudget`
 * (`./budget.ts`) still sees every token a case actually spent.
 *
 * In production (`./cli.ts`) this limiter's own 429 retry above is disabled
 * (`maxRetries: 0`) — `./retry.ts`'s `createRetryPolicy` is the single retry
 * owner (#307 C5), and it applies a STRICTER 429 policy than the one
 * described above: it retries a 429 only when {@link classifyQuotaEvidence}
 * unambiguously identifies a per-minute quota violation AND a trustworthy
 * hint is present, never a daily/mixed/unknown/malformed one and never an
 * invented fallback backoff. See `./retry.ts`'s module docs for that policy.
 * This module's own bounded-backoff 429 retry above still exists (and is
 * still tested directly in `rate-limit.test.ts`) for any future caller that
 * constructs a limiter without a `./retry.ts` policy in front of it.
 *
 * ## Observability (#307 options 1+2)
 *
 * `onRequest` fires once per real admitted request — the first attempt AND
 * every retry, each getting its own slot — with a sanitized
 * {@link RequestObservabilityRecord}: UTC admission/send/completion
 * timestamps (admission and send are the same instant here: this limiter
 * starts `operation()` the moment a slot is granted, never mislabeling an
 * outer retry loop's own attempt-start as the send time), how long the
 * request waited for a slot, the window's request count at admission
 * (`effectiveRpm`, since the window IS 60s), a per-limiter request identity,
 * and — only on a 429 — the sanitized {@link classifyQuotaEvidence}
 * classification and the parsed retry hint in milliseconds. It never
 * receives a raw error body, header, or credential.
 *
 * ## Testing
 *
 * `now`/`sleep` are injected (`rate-limit.test.ts` drives both from a fake
 * clock), so the window invariant, the retry-after path and the
 * no-retry-on-real-errors path are all proven with zero real model calls
 * and zero real timers.
 */

import { APICallError, wrapLanguageModel } from "ai";
import type { ChatModel } from "../model-provider.js";

/**
 * The documented free-tier requests-per-minute ceiling for this project's
 * default model, `gemini-3.5-flash-lite` (15 RPM / 500 RPD). SINGLE SOURCE
 * OF TRUTH for that number: `packages/agent/README.md`'s quota rationale
 * table documents it, `./cli.ts` derives `EVAL_RPM_LIMIT`'s default from
 * it, and the limiter below enforces against it — so the docs, the config
 * and the throttle cannot drift apart.
 */
export const FREE_TIER_RPM_CEILING = 15;

/**
 * Requests per minute deliberately left unspent. The eval key is SHARED
 * with live production chat traffic on the same Google project (see the
 * README's quota table), and the provider's own minute window does not
 * necessarily line up with ours, so the eval suite claims two thirds of the
 * ceiling and leaves the rest as headroom.
 */
export const RPM_SAFETY_MARGIN = 5;

/** Default requests-per-minute the eval suite allows itself — derived, never hard-coded. */
export const DEFAULT_EVAL_RPM_LIMIT = FREE_TIER_RPM_CEILING - RPM_SAFETY_MARGIN;

/** The rolling window a "requests per minute" quota is measured over. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** How many times a single request may be retried after a 429 before the run fails loudly. */
export const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3;

/** First backoff step used when a 429 carries no `retry-after`/`RetryInfo` hint; doubles per retry. */
export const DEFAULT_RETRY_BACKOFF_MS = 2_000;

/** Upper bound on any single retry wait — one full window, never more. */
export const MAX_RETRY_DELAY_MS = RATE_LIMIT_WINDOW_MS;

/** Reported to {@link RateLimiterOptions.onRetry} each time a 429 is about to be waited out. */
export interface RateLimitRetryInfo {
  /** 1-based retry number (the first retry is `1`). */
  attempt: number;
  /** How long the limiter is about to wait before retrying. */
  delayMs: number;
  /** The provider error's message — surfaced so a run's log says WHY it paused. */
  message: string;
}

/** Options for {@link createRequestRateLimiter}. `now`/`sleep` are the test seam. */
export interface RateLimiterOptions {
  /** Requests admitted per rolling window. Defaults to {@link DEFAULT_EVAL_RPM_LIMIT}. */
  rpmLimit?: number;
  /** Rolling window length. Defaults to {@link RATE_LIMIT_WINDOW_MS}. */
  windowMs?: number;
  /** Max retries after a 429. Defaults to {@link DEFAULT_MAX_RATE_LIMIT_RETRIES}. */
  maxRetries?: number;
  /** Clock source. Defaults to `Date.now`. */
  now?: () => number;
  /** Wait function. Defaults to a real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Called just before each 429 retry wait — used by `./cli.ts` to log the pause. */
  onRetry?: (info: RateLimitRetryInfo) => void;
  /**
   * Called once per real admitted request — the first attempt AND every
   * retry, each with its own {@link RequestObservabilityRecord} (#307
   * options 1+2). The safe, durable observability hook: never receives a raw
   * error body, header, or credential, only sanitized fields.
   */
  onRequest?: (record: RequestObservabilityRecord) => void;
}

/** A sliding-window request limiter. Every real provider request goes through {@link RequestRateLimiter.run}. */
export interface RequestRateLimiter {
  /**
   * Wait for a slot in the rolling window, run `operation`, and retry it —
   * bounded — if the provider answers with a rate-limit 429. Any other
   * error propagates unchanged, on the first occurrence.
   */
  run<T>(operation: () => PromiseLike<T>): Promise<T>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a protobuf duration string (`"1.5s"`, `"30s"`) into milliseconds, or `undefined` if it isn't one. */
function parseDurationMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match?.[1]) return undefined;
  return Math.round(Number(match[1]) * 1_000);
}

/** Read a `retry-after` response header (numeric seconds, or an HTTP date) as milliseconds. */
function retryAfterFromHeaders(
  headers: Record<string, string> | undefined,
  now: () => number,
): number | undefined {
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (raw === undefined) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? undefined : Math.max(0, asDate - now());
}

/**
 * Pull Google's `RetryInfo.retryDelay` out of a 429 body — the shape a real
 * Gemini rate-limit response carries:
 * `{ error: { details: [{ "@type": ".../google.rpc.RetryInfo", retryDelay: "1.5s" }] } }`.
 * Tolerant by design: an unparseable or differently-shaped body yields
 * `undefined` (the caller falls back to backoff), never a throw.
 */
function retryDelayFromBody(body: string | undefined): number | undefined {
  if (!body) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const error = (parsed as { error?: { details?: unknown } } | null)?.error;
  const details = error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const delayMs = parseDurationMs((detail as { retryDelay?: unknown } | null)?.retryDelay);
    if (delayMs !== undefined) return delayMs;
  }
  return undefined;
}

/** Walk an error's `cause` chain (bounded) looking for the provider's own `APICallError`. */
function findApiCallError(error: unknown): APICallError | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (APICallError.isInstance(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** True only for a provider rate-limit error (HTTP 429) — not for any other failure, however retryable it claims to be. */
export function isRateLimitError(error: unknown): boolean {
  return findApiCallError(error)?.statusCode === 429;
}

/**
 * The provider's own HTTP status code for an error, or `undefined` when it
 * isn't (or doesn't wrap) an `APICallError` — the same cause-chain walk
 * {@link isRateLimitError} uses, shared with `./retry.ts` (#307 C5) so the
 * single retry-owner policy classifies 502/503/504 the same way this module
 * classifies 429, from one source of truth.
 */
export function apiErrorStatusCode(error: unknown): number | undefined {
  return findApiCallError(error)?.statusCode;
}

/**
 * The provider's own "come back in N ms" hint for a rate-limit error: the
 * `retry-after` header first, then Gemini's `RetryInfo.retryDelay` in the
 * response body. `undefined` when the error carries no hint (or isn't an
 * API error at all) — callers fall back to bounded exponential backoff.
 */
export function parseRetryAfterMs(
  error: unknown,
  now: () => number = Date.now,
): number | undefined {
  const apiError = findApiCallError(error);
  if (!apiError) return undefined;
  return (
    retryAfterFromHeaders(apiError.responseHeaders, now) ??
    retryDelayFromBody(apiError.responseBody)
  );
}

function backoffMs(retryIndex: number): number {
  return DEFAULT_RETRY_BACKOFF_MS * 2 ** retryIndex;
}

/**
 * How confidently a 429's structured evidence identifies WHICH quota was
 * exhausted (#307 options 1+2). `"per-minute"` is the ONLY classification a
 * caller may treat as retryable — everything else (a daily cap, a mix of
 * daily+minute violations in the same response, evidence that names neither,
 * or a body that carries no parseable `QuotaFailure` detail at all) must
 * stop, because retrying against a daily/unknown/ambiguous quota cannot
 * possibly help within the run's own deadlines and wastes the shared
 * free-tier allowance other surfaces depend on.
 */
export type QuotaClassification = "per-minute" | "daily" | "mixed" | "unknown" | "malformed";

/** Pull the `QuotaFailure` detail's `violations` array out of a 429 body, or `undefined` if the shape doesn't match. */
function quotaViolationsFromBody(body: string | undefined): unknown[] | undefined {
  if (!body) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const details = (parsed as { error?: { details?: unknown } } | null)?.error?.details;
  if (!Array.isArray(details)) return undefined;
  const quotaFailure = details.find((detail) => {
    const type = (detail as { "@type"?: unknown } | null)?.["@type"];
    return typeof type === "string" && type.includes("QuotaFailure");
  }) as { violations?: unknown } | undefined;
  return Array.isArray(quotaFailure?.violations) ? quotaFailure.violations : undefined;
}

const MINUTE_QUOTA_PATTERN = /perminute/i;
const DAILY_QUOTA_PATTERN = /perday|daily/i;

/**
 * Classify a caught 429's structured evidence (see {@link QuotaClassification}
 * for what each value means) by reading `quotaId`/`quotaMetric` off every
 * violation the provider's own `QuotaFailure` detail lists — the same
 * `GenerateRequestsPerMinutePerProjectPerModel-FreeTier` /
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier` naming this module's
 * docs and `packages/agent/README.md`'s quota table already document. Never
 * throws; a missing/unparseable body or an error that isn't even an
 * `APICallError` yields `"malformed"`, the same "stop, don't guess" outcome
 * as any other non-`"per-minute"` classification.
 */
function violationIdentity(violation: unknown): string {
  const record = violation as { quotaId?: unknown; quotaMetric?: unknown } | null;
  return `${record?.quotaId ?? ""} ${record?.quotaMetric ?? ""}`;
}

export function classifyQuotaEvidence(error: unknown): QuotaClassification {
  const apiError = findApiCallError(error);
  const violations = quotaViolationsFromBody(apiError?.responseBody);
  if (violations === undefined) return "malformed";
  const identities = violations.map(violationIdentity);
  const sawMinute = identities.some((identity) => MINUTE_QUOTA_PATTERN.test(identity));
  const sawDaily = identities.some((identity) => DAILY_QUOTA_PATTERN.test(identity));
  const sawOther = identities.some(
    (identity) => !MINUTE_QUOTA_PATTERN.test(identity) && !DAILY_QUOTA_PATTERN.test(identity),
  );
  if (sawMinute && sawDaily) return "mixed";
  if (sawMinute && !sawOther) return "per-minute";
  if (sawDaily) return "daily";
  return "unknown";
}

/**
 * One real admitted request's sanitized timing/telemetry (#307 options
 * 1+2) — reported by {@link RateLimiterOptions.onRequest} once per actual
 * `operation()` invocation, whether it's a request's first attempt or a
 * retried one re-acquiring its own slot. Deliberately carries NO raw error
 * body, header value, or credential — only a numeric `statusCode`, the
 * controlled {@link QuotaClassification} enum, and a parsed hint in
 * milliseconds. `admittedAt` is also `sendAt`: this limiter starts
 * `operation()` (the real provider send) the instant a window slot is
 * granted, so the two are always equal here — kept as separate fields so a
 * caller never has to guess which timestamp a given consumer means, and so
 * this shape stays stable if a future change ever separates them.
 */
export interface RequestObservabilityRecord {
  /** Stable per-limiter-instance counter — a fresh request identity every time `operation()` runs, including a retry. */
  requestId: number;
  /** UTC ISO-8601 timestamp: when this request was admitted a window slot. */
  admittedAt: string;
  /** UTC ISO-8601 timestamp: when the real provider send actually started — distinct from an outer retry loop's own attempt-start bookkeeping (#307 options 1+2). */
  sendAt: string;
  /** UTC ISO-8601 timestamp: when `operation()` settled, success or failure. */
  completedAt: string;
  /** How long this request waited for a window slot before being admitted. */
  waitMs: number;
  /** Requests (including this one) inside the trailing window at the moment of admission. */
  windowCount: number;
  /** The window's request count expressed as an effective requests-per-minute rate — `windowCount` itself, since the window IS 60s. */
  effectiveRpm: number;
  outcome: "success" | "error";
  /** The provider's own HTTP status code, when `operation()` failed with an `APICallError`. */
  statusCode?: number;
  /** Present only when `statusCode` is 429 — see {@link classifyQuotaEvidence}. */
  quotaClassification?: QuotaClassification;
  /** The provider's own parsed "come back in N ms" hint, when present on a 429 — never the raw header/body it was read from. */
  retryHintMs?: number;
}

/**
 * Build a sliding-window limiter. Requests are admitted at most `rpmLimit`
 * per rolling `windowMs`; see the module docs for the full rationale.
 */
export function createRequestRateLimiter(options: RateLimiterOptions = {}): RequestRateLimiter {
  const rpmLimit = options.rpmLimit ?? DEFAULT_EVAL_RPM_LIMIT;
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  /** Admitted request timestamps still inside the window, oldest first. */
  const admitted: number[] = [];
  /** Serializes acquisitions: each caller waits for the previous one to finish acquiring. */
  let queue: Promise<void> = Promise.resolve();
  /** Request identity counter (#307 options 1+2) — a fresh id every time `operation()` actually runs, including a retry re-acquiring its own slot. */
  let nextRequestId = 0;

  function dropExpired(cutoff: number): void {
    while (admitted.length > 0 && (admitted[0] ?? 0) <= cutoff) {
      admitted.shift();
    }
  }

  /** Block until the rolling window has room, then record this request's timestamp. */
  async function takeSlot(): Promise<void> {
    for (;;) {
      const cutoff = now() - windowMs;
      dropExpired(cutoff);
      if (admitted.length < rpmLimit) {
        admitted.push(now());
        return;
      }
      // Wait exactly until the oldest admitted request leaves the window.
      await sleep(Math.max(1, (admitted[0] ?? cutoff) - cutoff));
    }
  }

  async function acquire(): Promise<void> {
    const previous = queue;
    let release = (): void => undefined;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await takeSlot();
    } finally {
      release();
    }
  }

  /** Base admission fields shared by the success/error observability records for one admitted request — split out purely to keep `run()`'s cognitive complexity under this repo's Biome limit. */
  function admissionBase(
    requestId: number,
    admittedAtIso: string,
    waitMs: number,
    windowCount: number,
  ): Omit<RequestObservabilityRecord, "outcome" | "completedAt"> {
    return {
      requestId,
      admittedAt: admittedAtIso,
      sendAt: admittedAtIso,
      waitMs,
      windowCount,
      effectiveRpm: windowCount,
    };
  }

  /**
   * Report a failed admitted request's sanitized observability record and
   * classify it for the retry decision below — split out of `run()` purely
   * to keep its cognitive complexity under this repo's Biome limit, no
   * behavior change from the single inline version this replaces.
   */
  function reportFailedRequest(
    base: Omit<RequestObservabilityRecord, "outcome" | "completedAt">,
    error: unknown,
  ): { rateLimited: boolean; retryHintMs: number | undefined } {
    const rateLimited = isRateLimitError(error);
    const statusCode = apiErrorStatusCode(error);
    const quotaClassification = rateLimited ? classifyQuotaEvidence(error) : undefined;
    const retryHintMs = rateLimited ? parseRetryAfterMs(error, now) : undefined;
    options.onRequest?.({
      ...base,
      completedAt: new Date(now()).toISOString(),
      outcome: "error",
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(quotaClassification !== undefined ? { quotaClassification } : {}),
      ...(retryHintMs !== undefined ? { retryHintMs } : {}),
    });
    return { rateLimited, retryHintMs };
  }

  async function run<T>(operation: () => PromiseLike<T>): Promise<T> {
    for (let retry = 0; ; retry++) {
      const requestId = nextRequestId++;
      const waitStart = now();
      await acquire();
      // #307 options 1+2: `admittedAt` IS the real provider send time — this
      // limiter starts `operation()` the instant a slot is granted, never
      // labeling an outer retry loop's own attempt-start bookkeeping (which
      // begins BEFORE the admission wait) as the send time.
      const admittedAt = now();
      const waitMs = admittedAt - waitStart;
      const admittedAtIso = new Date(admittedAt).toISOString();
      const base = admissionBase(requestId, admittedAtIso, waitMs, admitted.length);

      try {
        const result = await operation();
        options.onRequest?.({
          ...base,
          completedAt: new Date(now()).toISOString(),
          outcome: "success",
        });
        return result;
      } catch (error) {
        const { rateLimited, retryHintMs } = reportFailedRequest(base, error);

        if (retry >= maxRetries || !rateLimited) throw error;
        const hinted = retryHintMs ?? backoffMs(retry);
        const delayMs = Math.min(hinted, MAX_RETRY_DELAY_MS);
        options.onRetry?.({
          attempt: retry + 1,
          delayMs,
          message: error instanceof Error ? error.message : String(error),
        });
        await sleep(delayMs);
      }
    }
  }

  return { run };
}

/**
 * The model shapes `wrapLanguageModel` accepts / returns, derived from the
 * AI SDK's own signature rather than re-declared here — this package
 * doesn't depend on `@ai-sdk/provider` directly, and deriving keeps these
 * correct across an `ai` upgrade.
 */
type WrappableLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];
export type RateLimitedLanguageModel = ReturnType<typeof wrapLanguageModel>;

/** Options for {@link createRateLimitedModel}. */
export interface RateLimitedModelOptions {
  /** The model to wrap — `toLanguageModel(createChatModel())` in real use, a `MockLanguageModelV4` in tests. */
  model: WrappableLanguageModel;
  /** The limiter every request on this model must pass through. */
  limiter: RequestRateLimiter;
}

/** Thrown when {@link toLanguageModel} is handed something that isn't a language model instance (e.g. a model-router id string). */
export class UnsupportedModelError extends Error {
  constructor() {
    super(
      "Rate limiting requires a language model instance; received a model id/config string instead.",
    );
    this.name = "UnsupportedModelError";
  }
}

/**
 * Narrow `createChatModel()`'s `MastraModelConfig` union down to an actual
 * AI SDK language model instance — the only thing that can be wrapped with
 * middleware. A model-router id string (also a legal `MastraModelConfig`)
 * has no request boundary to hook, so it fails loudly rather than silently
 * running unthrottled.
 */
export function toLanguageModel(model: ChatModel): WrappableLanguageModel {
  if (typeof model !== "object" || model === null || !("doGenerate" in model)) {
    throw new UnsupportedModelError();
  }
  // Mastra vendors its own snapshot of the AI SDK provider types, so this
  // structurally-identical instance needs an explicit cast to cross the
  // package boundary.
  return model as WrappableLanguageModel;
}

/**
 * Wrap a language model so every `doGenerate`/`doStream` call it makes goes
 * through `limiter` — the model-boundary throttle described in this
 * module's docs. The wrapped model keeps the original's `modelId` and
 * `provider`, so an eval report stays attributable to the real model.
 */
export function createRateLimitedModel(options: RateLimitedModelOptions): RateLimitedLanguageModel {
  const { model, limiter } = options;

  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: ({ doGenerate }) => limiter.run(doGenerate),
      wrapStream: ({ doStream }) => limiter.run(doStream),
    },
  });
}
