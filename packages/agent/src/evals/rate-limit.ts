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

/**
 * Parse a protobuf duration string (`"1.5s"`, `"30s"`) into milliseconds, or
 * `undefined` if it isn't one — including a numerically valid-looking
 * duration whose seconds value is so large it overflows to a non-finite
 * millisecond figure (second independent Codex review, issuecomment-
 * 5608823305, finding 2's "overflow" requirement): never a trustworthy hint.
 */
function parseDurationMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match?.[1]) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return undefined;
  const delayMs = Math.round(seconds * 1_000);
  return Number.isFinite(delayMs) ? delayMs : undefined;
}

/**
 * One source's retry-hint evidence: genuinely {@link RETRY_EVIDENCE_ABSENT}
 * (the field wasn't supplied at all), {@link RETRY_EVIDENCE_INVALID} (the
 * field WAS supplied but doesn't parse into a trustworthy delay), or a valid
 * millisecond delay. Third independent Codex review (issuecomment-
 * 5620134895), finding 2: a caller combining two sources (the `retry-after`
 * header and the response body's `RetryInfo`) must never let a VALID hint
 * from one source rescue an INVALID one from the other — that previously
 * happened because both cases collapsed to the same `undefined` and were
 * silently excluded from the candidate list, indistinguishable from the
 * source simply being absent. Absence is fine to ignore; a present-but-
 * malformed value must poison the combined result instead.
 */
const RETRY_EVIDENCE_ABSENT = "absent";
const RETRY_EVIDENCE_INVALID = "invalid";
type RetryEvidence = number | typeof RETRY_EVIDENCE_ABSENT | typeof RETRY_EVIDENCE_INVALID;

/**
 * Parse a single `retry-after` header VALUE (numeric seconds, or an HTTP
 * date) — {@link RETRY_EVIDENCE_INVALID} for a value that is
 * empty/whitespace-only, negative, non-finite, an unparseable date, or a
 * numeric value whose multiplication into milliseconds overflows to a
 * non-finite figure. Never {@link RETRY_EVIDENCE_ABSENT}: by the time a
 * caller has a string to hand this function, the header key WAS present —
 * "genuinely missing" is decided one layer up, in {@link
 * retryAfterFromHeaders}, before this function is ever called (#307 fourth
 * independent Codex review, issuecomment-5620836057, finding 1 — an
 * explicitly-present but blank value is a different, untrustworthy signal
 * from the header key being absent altogether, and must poison the combined
 * result rather than being silently treated as if the header were never
 * sent at all).
 */
function parseRetryAfterHeaderValue(
  raw: string,
  now: () => number,
): number | typeof RETRY_EVIDENCE_INVALID {
  const trimmed = raw.trim();
  if (!trimmed) return RETRY_EVIDENCE_INVALID;
  const seconds = Number(trimmed);
  // A trimmed value that parses as a finite number is a NUMERIC-seconds
  // header, full stop — negative or otherwise invalid, it is rejected here
  // rather than falling through to `Date.parse`, which can misinterpret a
  // bare negative numeral (e.g. "-5") as an extended-year date far in the
  // past, silently producing a bogus near-zero delay (#307 Codex review,
  // finding 3's offline reproduction).
  if (Number.isFinite(seconds)) {
    if (seconds < 0) return RETRY_EVIDENCE_INVALID;
    const delayMs = Math.round(seconds * 1_000);
    return Number.isFinite(delayMs) ? delayMs : RETRY_EVIDENCE_INVALID;
  }
  const asDate = Date.parse(trimmed);
  return Number.isNaN(asDate) ? RETRY_EVIDENCE_INVALID : Math.max(0, asDate - now());
}

/**
 * Read EVERY case-insensitively-named `retry-after` response header entry as
 * {@link RetryEvidence} — never just the first key found via `??` (#307
 * fourth independent Codex review, issuecomment-5620836057, finding 2: a
 * response carrying both `retry-after: 1` and `Retry-After: 80` as two
 * DISTINCT object keys — case differing — previously resolved to only the
 * first one found and silently discarded the other). {@link
 * RETRY_EVIDENCE_ABSENT} when no key case-insensitively named `retry-after`
 * is present at all. {@link RETRY_EVIDENCE_INVALID} when any one present
 * entry fails to parse (see {@link parseRetryAfterHeaderValue}) — one bad
 * entry taints every entry from this source, exactly like a malformed body
 * `RetryInfo` detail already taints the whole body (same "stop, don't guess"
 * treatment as {@link retryDelaysFromBody}). When every entry present is
 * valid, returns their conservative MAXIMUM, never a shorter one — this
 * module must never resolve to a value earlier than any valid hint found.
 */
function retryAfterFromHeaders(
  headers: Record<string, string> | undefined,
  now: () => number,
): RetryEvidence {
  if (!headers) return RETRY_EVIDENCE_ABSENT;
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === "retry-after");
  if (entries.length === 0) return RETRY_EVIDENCE_ABSENT;
  const parsed = entries.map(([, value]) => parseRetryAfterHeaderValue(value, now));
  if (parsed.some((value) => value === RETRY_EVIDENCE_INVALID)) return RETRY_EVIDENCE_INVALID;
  return Math.max(...(parsed as number[]));
}

/** The exact `@type` Google's structured error details use for a retry hint — nothing else may supply one. */
const RETRY_INFO_TYPE = "type.googleapis.com/google.rpc.RetryInfo";

/**
 * Pull EVERY `google.rpc.RetryInfo` detail's `retryDelay` out of a 429 body
 * — the shape a real Gemini rate-limit response carries:
 * `{ error: { details: [{ "@type": ".../google.rpc.RetryInfo", retryDelay: "1.5s" }] } }`.
 * Only a detail whose `@type` is EXACTLY {@link RETRY_INFO_TYPE} may supply a
 * hint (#307 Codex review, finding 3) — an unrelated detail that happens to
 * carry a `retryDelay`-shaped field is not trustworthy evidence.
 *
 * Second independent Codex review (issuecomment-5608823305), finding 2: a
 * response may carry more than one `RetryInfo` detail (or the body's own
 * `RetryInfo` may simply be malformed), and the caller must never silently
 * pick one over another or drop a malformed one in favor of a valid
 * sibling — the same "one bad entry taints the whole" treatment
 * {@link classifyQuotaEvidence} already applies to `QuotaFailure` details.
 * Returns every valid delay found, {@link RETRY_EVIDENCE_ABSENT} when the
 * body carries NO `RetryInfo` detail at all (missing/unparseable body
 * included), or {@link RETRY_EVIDENCE_INVALID} when the body DOES carry a
 * `RetryInfo` detail but ANY one present fails to parse (third independent
 * Codex review, finding 2 — distinct from "absent" so a caller combining
 * this with the header's own evidence never lets a valid header rescue this
 * malformed body evidence) — never a partial list that quietly excludes the
 * bad one.
 */
function retryDelaysFromBody(body: string | undefined): number[] | RetryEvidence {
  if (!body) return RETRY_EVIDENCE_ABSENT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return RETRY_EVIDENCE_ABSENT;
  }
  const error = (parsed as { error?: { details?: unknown } } | null)?.error;
  const details = error?.details;
  if (!Array.isArray(details)) return RETRY_EVIDENCE_ABSENT;
  const retryInfoDetails = details.filter(
    (detail) => (detail as { "@type"?: unknown } | null)?.["@type"] === RETRY_INFO_TYPE,
  );
  if (retryInfoDetails.length === 0) return RETRY_EVIDENCE_ABSENT;
  const delays = retryInfoDetails.map((detail) =>
    parseDurationMs((detail as { retryDelay?: unknown }).retryDelay),
  );
  if (delays.some((delay) => delay === undefined)) return RETRY_EVIDENCE_INVALID;
  return delays as number[];
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
 * The provider's own "come back in N ms" hint for a rate-limit error,
 * resolved from EVERY relevant piece of evidence — the `retry-after`
 * header AND every `RetryInfo` detail in the response body — never just the
 * first one found (second independent Codex review, issuecomment-
 * 5608823305, finding 2). When more than one source supplies a valid hint
 * and they disagree, this returns the CONSERVATIVE maximum, never a shorter
 * one: honoring the shortest of two conflicting hints risks retrying before
 * the provider is actually willing to accept another request, whichever
 * source said so. `undefined` when the error carries no hint at all (or
 * isn't an API error), or when EITHER source present is malformed (see
 * {@link retryAfterFromHeaders}/{@link retryDelaysFromBody}) — callers must
 * stop conservatively rather than inventing a fallback in either case.
 * Third independent Codex review (issuecomment-5620134895), finding 2: a
 * malformed header must NEVER be rescued by a valid body `RetryInfo` hint,
 * nor a malformed body `RetryInfo` rescued by a valid header — either source
 * being genuinely ABSENT is fine (the other source's evidence, if valid, is
 * still honored), but a source that WAS supplied and failed to parse
 * poisons the combined result, exactly as if the request carried no
 * trustworthy hint at all.
 */
export function parseRetryAfterMs(
  error: unknown,
  now: () => number = Date.now,
): number | undefined {
  const apiError = findApiCallError(error);
  if (!apiError) return undefined;
  const headerEvidence = retryAfterFromHeaders(apiError.responseHeaders, now);
  const bodyEvidence = retryDelaysFromBody(apiError.responseBody);
  if (headerEvidence === RETRY_EVIDENCE_INVALID || bodyEvidence === RETRY_EVIDENCE_INVALID) {
    return undefined;
  }
  const candidates = [
    ...(typeof headerEvidence === "number" ? [headerEvidence] : []),
    ...(Array.isArray(bodyEvidence) ? bodyEvidence : []),
  ];
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
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

/** The exact `@type` real Gemini `QuotaFailure` details use — anchored, never a substring match. */
const QUOTA_FAILURE_TYPE = "type.googleapis.com/google.rpc.QuotaFailure";

/** Sentinel distinguishing "this detail IS an exact-type QuotaFailure, but its `violations` field doesn't parse" from "this detail isn't a QuotaFailure at all" (`undefined`) — see {@link quotaViolationsFromBody}. */
const MALFORMED_QUOTA_FAILURE_DETAIL = Symbol("malformed-quota-failure-detail");

/**
 * Pull one `QuotaFailure`-typed detail's `violations` array. `undefined`
 * when `detail`'s `@type` isn't EXACTLY {@link QUOTA_FAILURE_TYPE} — second
 * independent Codex review (issuecomment-5608823305), finding 1's first
 * repro: a `.includes()`-style substring match previously accepted an
 * unrelated `@type` (e.g. `"...unrelatedQuotaFailure"`) that merely
 * contained the marker, even when it named a real minute quotaId.
 * {@link MALFORMED_QUOTA_FAILURE_DETAIL} when the `@type` DOES match exactly
 * but `violations` isn't an array at all — finding 1's second repro: this
 * used to fall back to `[]` and silently disappear rather than being
 * treated as untrustworthy evidence. A genuinely empty `violations` array
 * (the detail exists, names nothing) is returned as-is, distinct from both.
 */
function violationsFromQuotaFailureDetail(
  detail: unknown,
): unknown[] | typeof MALFORMED_QUOTA_FAILURE_DETAIL | undefined {
  const record = detail as { "@type"?: unknown; violations?: unknown } | null;
  if (record?.["@type"] !== QUOTA_FAILURE_TYPE) return undefined;
  return Array.isArray(record.violations) ? record.violations : MALFORMED_QUOTA_FAILURE_DETAIL;
}

/**
 * Pull EVERY `QuotaFailure` detail's `violations` out of a 429 body,
 * aggregated across all of them — not just the first one (#307 Codex review
 * of abcb16b, finding 1: `details.find(...)` stopped at the first matching
 * detail and silently dropped every other `QuotaFailure` in the same
 * response, so a real response naming a minute violation in one detail and a
 * daily violation in a SEPARATE detail misclassified as `"per-minute"`).
 * `undefined` when the body is missing/unparseable/malformed-shaped, names
 * NO `QuotaFailure` detail at all, OR when ANY exact-type `QuotaFailure`
 * detail present has a malformed `violations` field (second independent
 * Codex review, finding 1: a malformed relevant detail must taint the WHOLE
 * response rather than being dropped in favor of another, valid detail that
 * does parse) — a `QuotaFailure` detail with a genuinely empty `violations`
 * array still counts as "found", just with nothing to classify.
 */
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
  const results = details
    .map(violationsFromQuotaFailureDetail)
    .filter(
      (result): result is unknown[] | typeof MALFORMED_QUOTA_FAILURE_DETAIL => result !== undefined,
    );
  if (results.some((result) => result === MALFORMED_QUOTA_FAILURE_DETAIL)) return undefined;
  if (results.length === 0) return undefined;
  return (results as unknown[][]).flat();
}

/**
 * The exact, anchored real-Gemini request-quota id prefixes this module
 * trusts — see `packages/agent/README.md`'s quota-rationale table. Anchored
 * with `^`/`(-|$)` so a lookalike id that merely CONTAINS "PerMinute"/
 * "PerDay" as a substring of an unrelated identifier (#307 Codex review,
 * finding 1) never matches, and so a TOKEN-quota id (e.g.
 * `GenerateContentInputTokensPerModelPerMinute-FreeTier`, a different quota
 * family entirely — Codex's "request-vs-token quota" requirement) never
 * matches either: only the real REQUEST-count quota ids do.
 */
const MINUTE_REQUEST_QUOTA_ID = /^GenerateRequestsPerMinutePerProjectPerModel(-|$)/i;
const DAILY_REQUEST_QUOTA_ID = /^GenerateRequestsPerDayPerProjectPerModel(-|$)/i;

/**
 * The exact, real request-count `quotaMetric` value Gemini's free-tier 429s
 * carry (`packages/agent/README.md`'s quota-rationale table:
 * `generativelanguage.googleapis.com/generate_content_free_tier_requests`).
 * The ONLY metric value {@link categorizeViolation} trusts when a violation
 * supplies one at all — anything else (a different metric family, e.g. the
 * TOKEN-count metric `.../generate_content_free_tier_input_token_count`, or
 * a non-string value) is inconsistent/untrustworthy evidence, never silently
 * ignored in favor of `quotaId` alone (third independent Codex review,
 * issuecomment-5620134895, finding 1).
 */
const REQUEST_QUOTA_METRIC =
  "generativelanguage.googleapis.com/generate_content_free_tier_requests";

type ViolationCategory = "minute" | "daily" | "other";

/**
 * Categorize one violation by its `quotaId` — `undefined` when the entry
 * itself is malformed (a non-string `quotaId`, #307 Codex review, finding
 * 1's "validate string IDs/metrics" requirement), which {@link
 * classifyQuotaEvidence} treats as untrustworthy evidence overall rather
 * than silently ignoring the one bad entry and guessing from the rest.
 *
 * A `quotaMetric` field, when the violation supplies one at all, is
 * validated too (third independent Codex review, issuecomment-5620134895,
 * finding 1): `categorizeViolation` previously classified purely off
 * `quotaId` and ignored `quotaMetric` entirely, so a violation naming a real
 * minute `quotaId` alongside a non-string `quotaMetric`, or one naming the
 * TOKEN-count metric (a different quota family than the request-count
 * `quotaId` claims), still classified as `"minute"` — inconsistent/malformed
 * evidence must stop, never be silently trusted off `quotaId` alone. A
 * violation that supplies no `quotaMetric` at all is unaffected — `quotaId`
 * remains sufficient evidence on its own, exactly as before this fix.
 */
function categorizeViolation(violation: unknown): ViolationCategory | undefined {
  const record = violation as { quotaId?: unknown; quotaMetric?: unknown } | null;
  const quotaId = record?.quotaId;
  if (typeof quotaId !== "string") return undefined;
  if (
    record !== null &&
    record !== undefined &&
    "quotaMetric" in record &&
    record.quotaMetric !== undefined &&
    (typeof record.quotaMetric !== "string" || record.quotaMetric !== REQUEST_QUOTA_METRIC)
  ) {
    return undefined;
  }
  if (MINUTE_REQUEST_QUOTA_ID.test(quotaId)) return "minute";
  if (DAILY_REQUEST_QUOTA_ID.test(quotaId)) return "daily";
  return "other";
}

/**
 * Classify a caught 429's structured evidence (see {@link QuotaClassification}
 * for what each value means) by reading `quotaId` off every violation across
 * EVERY `QuotaFailure` detail the provider's response lists (#307 Codex
 * review, finding 1). Never throws; a missing/unparseable body, a body
 * naming no `QuotaFailure` detail at all, or any violation with a malformed
 * (non-string) `quotaId` yields `"malformed"` — the same "stop, don't guess"
 * outcome as any other non-`"per-minute"` classification.
 */
export function classifyQuotaEvidence(error: unknown): QuotaClassification {
  const apiError = findApiCallError(error);
  const violations = quotaViolationsFromBody(apiError?.responseBody);
  if (violations === undefined || violations.length === 0) return "malformed";
  const categories = violations.map(categorizeViolation);
  if (categories.some((category) => category === undefined)) return "malformed";
  const sawMinute = categories.includes("minute");
  const sawDaily = categories.includes("daily");
  const sawOther = categories.includes("other");
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
 * milliseconds. `admittedAt` and `sendAt` are DISTINCT reads, not a copy of
 * one into the other (third independent Codex review, issuecomment-
 * 5620134895, finding 3 — corrected stale prose that claimed the two are
 * "always equal": `run()` below takes its own fresh `now()` read for
 * `sendAt` right before invoking `operation()`, deliberately never reusing
 * `admittedAt`'s own atomically-captured value). In production the two are
 * ordinarily a fraction of a millisecond apart, since this limiter starts
 * `operation()` immediately once a window slot is granted — kept as
 * separate fields so a caller never has to guess which timestamp a given
 * consumer means, and so a future change that adds real work between
 * admission and send is reflected automatically rather than silently
 * staying "equal" by construction.
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

/** What {@link createRequestRateLimiter}'s internal `takeSlot` hands back the instant a slot is granted — read once, by the same synchronous continuation that granted it, never re-derived from `now()` later (see `acquire`'s doc comment inside that function for why). */
interface AdmittedSlot {
  admittedAt: number;
  /** `admitted.length` at the moment this slot was granted, including this request. */
  windowCount: number;
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
  /** When the most recently admitted request was let through, or `undefined` before the first admission — drives {@link MIN_ADMISSION_SPACING_MS} below. */
  let lastAdmittedAt: number | undefined;

  /**
   * Minimum gap enforced between two successive admissions (#307 Codex
   * review, finding 1). The rolling-window cap alone permits an entire
   * window's worth of requests to be admitted in a single instant as long as
   * the window has room — Codex's offline reproduction against abcb16b
   * showed ten sequential instant operations against `rpmLimit: 10` all
   * admitted at send-time `[0,0,0,0,0,0,0,0,0,0]`. Evenly spacing admissions
   * across the window (`windowMs / rpmLimit`) smooths that burst out while
   * the rolling-cap check below remains the authoritative invariant (a
   * belt-and-braces bound, not replaced by spacing) — see
   * `expectWithinRollingWindow` in `rate-limit.test.ts`.
   */
  const minAdmissionSpacingMs = windowMs / rpmLimit;

  function dropExpired(cutoff: number): void {
    while (admitted.length > 0 && (admitted[0] ?? 0) <= cutoff) {
      admitted.shift();
    }
  }

  /**
   * Block until the rolling window has room AND the minimum inter-admission
   * spacing has elapsed since the last admission, then record this request's
   * timestamp (#307 Codex review, finding 1 — a retry reacquiring a slot
   * goes through this exact same path, so it is paced identically to a first
   * attempt).
   */
  async function takeSlot(): Promise<AdmittedSlot> {
    for (;;) {
      const nowMs = now();
      const cutoff = nowMs - windowMs;
      dropExpired(cutoff);
      const spacingReadyAt =
        lastAdmittedAt === undefined ? nowMs : lastAdmittedAt + minAdmissionSpacingMs;
      if (admitted.length < rpmLimit && nowMs >= spacingReadyAt) {
        admitted.push(nowMs);
        lastAdmittedAt = nowMs;
        return { admittedAt: nowMs, windowCount: admitted.length };
      }
      const windowWaitMs = admitted.length >= rpmLimit ? (admitted[0] ?? cutoff) - cutoff : 0;
      const spacingWaitMs = Math.max(0, spacingReadyAt - nowMs);
      await sleep(Math.max(1, Math.max(windowWaitMs, spacingWaitMs)));
    }
  }

  /**
   * Wait for a slot and return exactly when/how full the window was AT THE
   * MOMENT this caller was admitted — the caller must use THIS return value,
   * never a fresh `now()`/`admitted.length` read afterward (#307 Codex
   * review, finding 1's fake-clock proof surfaced this: once pacing added a
   * real await between one caller's admission and the next, a concurrently
   * unblocked waiter's own `sleep()` could advance the shared virtual clock
   * before this caller's continuation resumed, making a later `now()` read
   * describe a DIFFERENT request's admission instant, not this one's).
   */
  async function acquire(): Promise<AdmittedSlot> {
    const previous = queue;
    let release = (): void => undefined;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await takeSlot();
    } finally {
      release();
    }
  }

  /** Base admission fields shared by the success/error observability records for one admitted request — split out purely to keep `run()`'s cognitive complexity under this repo's Biome limit. */
  function admissionBase(
    requestId: number,
    admittedAtIso: string,
    sendAtIso: string,
    waitMs: number,
    windowCount: number,
  ): Omit<RequestObservabilityRecord, "outcome" | "completedAt"> {
    return {
      requestId,
      admittedAt: admittedAtIso,
      sendAt: sendAtIso,
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
      // #307 options 1+2 / #307 Codex review, finding 1: `admittedAt` IS the
      // real provider send time — this limiter starts `operation()` the
      // instant a slot is granted, never labeling an outer retry loop's own
      // attempt-start bookkeeping (which begins BEFORE the admission wait)
      // as the send time. `acquire()`'s OWN return value is used here —
      // never a fresh `now()` call after it resolves — because pacing added
      // a real await between one caller's admission and the next; a
      // concurrently unblocked waiter's own wait can advance the (virtual,
      // in tests) clock before this continuation resumes, so re-reading
      // `now()` here could describe a LATER request's admission instant, not
      // this one's (see `acquire`'s own doc comment).
      const { admittedAt, windowCount } = await acquire();
      const waitMs = admittedAt - waitStart;
      const admittedAtIso = new Date(admittedAt).toISOString();
      // Second independent Codex review (issuecomment-5608823305), finding
      // 3: `sendAt` is its OWN `now()` read, taken right before `operation()`
      // is actually invoked below — never a copy-by-assignment of
      // `admittedAtIso` (which describes the moment a slot was GRANTED, a
      // distinct, atomically-captured instant `acquire()`'s own doc comment
      // explains). In production the two are ordinarily a fraction of a
      // millisecond apart; this still reads a fresh timestamp rather than
      // fabricating one by reuse, so a future change that adds real work
      // between admission and send is reflected automatically.
      const sendAtIso = new Date(now()).toISOString();
      const base = admissionBase(requestId, admittedAtIso, sendAtIso, waitMs, windowCount);

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
