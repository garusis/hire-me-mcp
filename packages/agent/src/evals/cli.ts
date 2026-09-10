/**
 * The eval suite's single documented entry point (#72):
 *
 *   pnpm --filter @hire-me-mcp/agent eval:agent
 *
 * Wires the pure `./runner.ts` up to the REAL interview agent
 * (`getInterviewAgent()`, real Gemini calls via the local `.env` key — see
 * `packages/agent/README.md`'s provider table) whose model is wrapped in
 * the sliding-window request limiter from `./rate-limit.ts` (#282 — the
 * throttle belongs at the model boundary, because one case makes several
 * provider requests), runs the curated dataset
 * (`./dataset/cases.ts`) under the configured case/budget caps
 * (`./budget.ts`), writes the machine-readable report (`./report.ts`) to
 * disk, prints a short human summary, and exits non-zero when the verdict
 * fails or the run aborts on budget — so this command is CI-shaped even
 * though CI wiring itself is #73's job.
 *
 * `resolveRunnerEnvConfig` and `extractCitationsFromToolResults` are pure,
 * exported, and unit-tested (`cli.test.ts`) with zero model calls; `main()`
 * itself — the real network call, the real filesystem write — is
 * deliberately NOT part of that test suite, the same "one-off, manually
 * invoked, not in CI" posture `scripts/smoke.ts` already documents for this
 * package. It only runs when this file is executed directly (not when
 * `cli.test.ts` imports its pure helpers).
 */

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolveChatModelConfig } from "../config.js";
import { getInterviewAgent, PROMPT_VERSION } from "../index.js";
import { createChatModel } from "../model-provider.js";
import { BudgetExceededError, createBudgetGuard, getModelPricing } from "./budget.js";
import { EVAL_CASES } from "./dataset/index.js";
import type { EvalCase } from "./dataset/schema.js";
import {
  createRateLimitedModel,
  createRequestRateLimiter,
  DEFAULT_EVAL_RPM_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  type RequestObservabilityRecord,
  toLanguageModel,
} from "./rate-limit.js";
import type {
  CorrelatedObservabilityRecord,
  EvalReport,
  ObservabilityLog,
  ObservabilityLogMeta,
} from "./report.js";
import {
  classifyProviderError,
  createRetryingModel,
  createRetryPolicy,
  type RetryAttemptRecord,
  type RetryPolicy,
  sumKnownUsage,
} from "./retry.js";
import { type CaseFailureInfo, type CaseRunResult, EvalCaseError, runEvalSuite } from "./runner.js";
import type { ReturnedCitation } from "./scorers/types.js";
import { EVAL_THRESHOLDS } from "./thresholds.js";

/** Minimal shape this module reads off `process.env` — mirrors the pattern `apps/web/lib/chat/agent-limits.ts` uses. */
export type RunnerEnv = Readonly<Record<string, string | undefined>>;

export interface RunnerEnvConfig {
  maxCases: number;
  maxTotalTokens: number;
  maxCostUsd: number;
  /**
   * Max real PROVIDER REQUESTS per rolling minute (`EVAL_RPM_LIMIT`) — not
   * cases per minute, which is what this knob silently meant before #282.
   * Enforced at the model boundary by `./rate-limit.ts`.
   */
  rpmLimit: number;
  reportPath: string;
  /**
   * Where the limiter's own safe, durable per-request observability log is
   * written (#307 options 1+2) — admission/send/completion timestamps, wait
   * duration, window count/effective RPM, request identity, and (on a 429)
   * sanitized quota classification/retry hint. A SEPARATE file from
   * `reportPath`: this is request/limiter-boundary telemetry for the whole
   * run, not part of any one case's scored result.
   */
  observabilityPath: string;
  /**
   * Optional dataset-case-id filter (`EVAL_CASE_IDS`, comma-separated) — the
   * `--case` seam this module didn't have before #143: reproducing a single
   * failing case (e.g. `grounded-nodejs-experience`) a few times to check
   * whether a failure is systematic or stochastic previously required
   * burning the full dataset's budget/quota on every attempt. `undefined`
   * (the default — env unset or blank) means "run everything", same as
   * before this option existed.
   */
  caseIds?: string[];
}

/**
 * Conservative defaults for an UNCONFIGURED real run: small enough that a
 * default invocation costs a handful of Gemini free-tier calls, not the
 * whole dataset. Override via env for a fuller run.
 */
const DEFAULTS: RunnerEnvConfig = {
  maxCases: 8,
  maxTotalTokens: 60_000,
  maxCostUsd: 0.5,
  // Derived from the documented free-tier ceiling — see `./rate-limit.ts`,
  // the single source of truth this, the limiter and the README share.
  rpmLimit: DEFAULT_EVAL_RPM_LIMIT,
  reportPath: "eval-report.json",
  observabilityPath: "eval-observability.json",
};

function readPositiveNumber(env: RunnerEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Parse `EVAL_CASE_IDS` (comma-separated) into a trimmed, non-empty id list, or `undefined` when unset/blank. */
function readCaseIds(env: RunnerEnv): string[] | undefined {
  const raw = env.EVAL_CASE_IDS?.trim();
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

/** Resolve the eval runner's env-configurable knobs, falling back to conservative defaults for anything unset or malformed. */
export function resolveRunnerEnvConfig(env: RunnerEnv = process.env): RunnerEnvConfig {
  const caseIds = readCaseIds(env);
  return {
    maxCases: readPositiveNumber(env, "EVAL_MAX_CASES", DEFAULTS.maxCases),
    maxTotalTokens: readPositiveNumber(env, "EVAL_MAX_TOTAL_TOKENS", DEFAULTS.maxTotalTokens),
    maxCostUsd: readPositiveNumber(env, "EVAL_MAX_COST_USD", DEFAULTS.maxCostUsd),
    rpmLimit: readPositiveNumber(env, "EVAL_RPM_LIMIT", DEFAULTS.rpmLimit),
    reportPath: env.EVAL_REPORT_PATH?.trim() || DEFAULTS.reportPath,
    observabilityPath: env.EVAL_OBSERVABILITY_PATH?.trim() || DEFAULTS.observabilityPath,
    ...(caseIds ? { caseIds } : {}),
  };
}

/**
 * Filter `cases` down to just the ids in `caseIds`, preserving dataset order
 * (not filter-argument order) — `undefined` (no filter) returns every case
 * unchanged. Throws loudly on an id that doesn't exist in the dataset rather
 * than silently running nothing for it, since a typo'd `--case`/env value
 * should fail fast, not produce a quietly-empty report.
 */
export function filterCasesByIds(
  cases: readonly EvalCase[],
  caseIds: string[] | undefined,
): readonly EvalCase[] {
  if (!caseIds) return cases;
  const requested = new Set(caseIds);
  const found = cases.filter((evalCase) => requested.has(evalCase.id));
  const foundIds = new Set(found.map((evalCase) => evalCase.id));
  const missing = caseIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown eval case id(s): ${missing.join(", ")}`);
  }
  return found;
}

/**
 * Wrap the limiter's own already-sanitized, per-case-correlated
 * {@link CorrelatedObservabilityRecord}s with the run's identity/configured
 * knobs, a generation timestamp and count (#307 options 1+2 / #307 Codex
 * review, finding 4: "configured RPM/window duration separately from
 * observed count; model/run and case/logical-request/attempt correlation so
 * events can be attributed") — pure and exported so it's unit-testable with
 * zero real model calls, the same "pure/testable piece pulled out of
 * `main()`" pattern this file already follows. Never transforms/redacts a
 * record's own fields: `./rate-limit.ts`'s `onRequest` records are already
 * safe to persist as-is (no raw error body, header, or credential); only the
 * case correlation fields and this function's own `meta`/timestamp/count
 * wrapping are added.
 */
export function buildObservabilityLog<R extends CorrelatedObservabilityRecord>(
  requests: readonly R[],
  meta: ObservabilityLogMeta,
  now: () => string = () => new Date().toISOString(),
): Omit<ObservabilityLog, "requests"> & { requests: R[] } {
  return { ...meta, generatedAt: now(), requestCount: requests.length, requests: [...requests] };
}

/**
 * A {@link CorrelatedObservabilityRecord} plus the explicit retry identity
 * {@link ObservabilityCollector.beginRequest} supplies (second independent
 * Codex review, issuecomment-5608823305, finding 3) — `attempt` is kept
 * local to this collector rather than added to `./report.ts`'s own
 * `CorrelatedObservabilityRecord` interface, since it is genuinely optional
 * (a record admitted without a matching `beginRequest` call never carries
 * it) and `./report.ts`'s `buildReport` already persists whatever shape its
 * caller hands it (`params.observability ?? null`, no field-level
 * reconstruction) — the key still lands in the real, persisted
 * `eval-report.json`/`eval-observability.json` JSON exactly as any other
 * field would.
 */
type ObservabilityRequestRecord = CorrelatedObservabilityRecord & { attempt?: number };

/** Mutable per-run scratch space `main()` shares with the limiter's `onRequest` hook — see {@link createObservabilityCollector}. */
export interface ObservabilityCollector {
  /** Passed as `./rate-limit.ts`'s `RateLimiterOptions.onRequest` — stamps the record with whichever case's requests are currently in flight (per the most recent {@link startCase} call), per #307 Codex review, finding 4. */
  onRequest: (record: RequestObservabilityRecord) => void;
  /**
   * Mark that a new eval case's requests are about to start — every
   * subsequent `onRequest` record is stamped with `caseId` and a fresh
   * 1-based `caseRequestSequence` until the next call (#307 Codex review,
   * finding 4). `./cli.ts`'s `createRunCase` calls this via its
   * `onCaseStart` option, once per case, before `agent.generate` runs.
   */
  startCase: (caseId: string) => void;
  /**
   * Stamp the identity the NEXT `onRequest` record must carry — the same
   * `requestIndex`/`attempt` `./retry.ts`'s own attempt tracker
   * (`createCaseAttemptTracker.beginAttempt`) already computed for it,
   * captured BEFORE `operation()` runs (second independent Codex review,
   * issuecomment-5608823305, finding 3). `main()` wires this to
   * `createEvalRetryPolicy`'s `onBeforeAttempt` hook. Consumed exactly once
   * by the next `onRequest` call, then cleared — a request admitted without
   * a matching `beginRequest` call (should not happen in real wiring) falls
   * back to the previous per-case auto-incrementing `caseRequestSequence`
   * and carries no `attempt` at all, rather than reusing a stale stamp.
   */
  beginRequest: (requestIndex: number, attempt: number) => void;
  /** Build the durable {@link ObservabilityLog} from every record collected so far. */
  log: (
    meta: ObservabilityLogMeta,
    now?: () => string,
  ) => Omit<ObservabilityLog, "requests"> & { requests: ObservabilityRequestRecord[] };
}

/**
 * Build the mutable collector `main()` wires the shared limiter's
 * `onRequest` hook through (#307 options 1+2) — the same closure-over-array
 * pattern `createCaseAttemptTracker` already establishes in this file.
 * Collects every real admitted request for the whole run (not per-case),
 * since the limiter/window is shared across the entire run rather than
 * scoped to one case; each record is still stamped with WHICH case it
 * belongs to (#307 Codex review, finding 4) via {@link
 * ObservabilityCollector.startCase}. A record admitted before any case has
 * started (should not happen in a real run) is stamped `caseId: null` rather
 * than silently attributed to the wrong case.
 */
export function createObservabilityCollector(): ObservabilityCollector {
  const requests: ObservabilityRequestRecord[] = [];
  let currentCaseId: string | null = null;
  let caseRequestSequence = 0;
  let pendingRequestIndex: number | null = null;
  let pendingAttempt: number | null = null;
  return {
    startCase: (caseId) => {
      currentCaseId = caseId;
      caseRequestSequence = 0;
      pendingRequestIndex = null;
      pendingAttempt = null;
    },
    beginRequest: (requestIndex, attempt) => {
      pendingRequestIndex = requestIndex;
      pendingAttempt = attempt;
    },
    onRequest: (record) => {
      if (currentCaseId !== null) caseRequestSequence += 1;
      const sequence = pendingRequestIndex ?? (currentCaseId !== null ? caseRequestSequence : null);
      const attempt = pendingAttempt;
      pendingRequestIndex = null;
      pendingAttempt = null;
      requests.push({
        ...record,
        caseId: currentCaseId,
        caseRequestSequence: sequence,
        ...(attempt !== null ? { attempt } : {}),
      });
    },
    log: (meta, now) => buildObservabilityLog(requests, meta, now),
  };
}

function isReturnedCitation(value: unknown): value is ReturnedCitation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.entityType === "string" && typeof candidate.entityId === "string";
}

/** Pull the `DomainResult.citations` array off one tool result's `payload.result`, or `undefined` if the shape doesn't match — no throw, tolerant of real, unpredictable model output. */
function readCitationsField(toolResult: unknown): unknown {
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const payload = (toolResult as Record<string, unknown>).payload;
  if (typeof payload !== "object" || payload === null) return undefined;
  const result = (payload as Record<string, unknown>).result;
  if (typeof result !== "object" || result === null) return undefined;
  return (result as Record<string, unknown>).citations;
}

/**
 * Flatten every tool call's `DomainResult.citations` (`packages/core`'s
 * `createDomainResult` envelope, `{ data, citations }`) out of a real
 * `agent.generate()` result's `toolResults` array. Tolerant by design — a
 * malformed or errored tool result contributes no citations rather than
 * throwing, since this runs against real, unpredictable model output.
 */
export function extractCitationsFromToolResults(
  toolResults: readonly unknown[],
): ReturnedCitation[] {
  const citations: ReturnedCitation[] = [];
  for (const toolResult of toolResults) {
    const rawCitations = readCitationsField(toolResult);
    if (!Array.isArray(rawCitations)) continue;
    for (const citation of rawCitations) {
      if (isReturnedCitation(citation)) {
        citations.push({
          entityType: citation.entityType,
          entityId: citation.entityId,
          fragment: citation.fragment,
        });
      }
    }
  }
  return citations;
}

/**
 * Extract every tool call's `toolName` (in call order, duplicates kept) off
 * a real `agent.generate()` result's `toolResults` array (#75) — the
 * tool-call trace `scoreToolRouting` (`./scorers/tool-routing.ts`) checks a
 * dataset case's `expectedToolCall` against. Tolerant by design, same as
 * `extractCitationsFromToolResults` above: a malformed entry (missing or
 * non-string `toolName`) is skipped, never thrown on.
 */
export function extractToolNamesFromToolResults(toolResults: readonly unknown[]): string[] {
  const names: string[] = [];
  for (const toolResult of toolResults) {
    if (typeof toolResult !== "object" || toolResult === null) continue;
    const entry = toolResult as Record<string, unknown>;
    // Real `agent.generate()` tool results are `ToolResultChunk`s —
    // `{ type: "tool-result", payload: { toolName, result, ... } }`
    // (`@mastra/core`'s `ToolResultPayload`) — so the name lives on
    // `payload.toolName`, exactly where `readCitationsField` above reads
    // `payload.result`. Reading it at the top level instead made this
    // return `[]` on every real run, deterministically failing 5 of the 6
    // tool-routing cases (the sixth, `deterministic-only`, passed
    // trivially — aggregate 0.1667). The top-level fallback keeps the
    // tolerant behavior for any flatter shape.
    const payload = entry.payload;
    const payloadToolName =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>).toolName
        : undefined;
    const toolName = typeof payloadToolName === "string" ? payloadToolName : entry.toolName;
    if (typeof toolName === "string") {
      names.push(toolName);
    }
  }
  return names;
}

/**
 * One real tool call's name, the arguments the model actually supplied, and
 * the citations that specific call's own `DomainResult` returned — the unit
 * {@link extractToolCallsFromToolResults} extracts and {@link
 * scoreToolRouting} inspects (#294; `citations` added in the #294
 * independent-review correction, finding 1).
 */
export interface ToolCall {
  toolName: string;
  args: unknown;
  citations?: ReturnedCitation[];
}

/** Read one tool result's own `citations`, the same way {@link readCitationsField} does for the whole-run flatten — `undefined` when the tool result's shape doesn't parse, an array (possibly empty) otherwise. */
function readOwnCitations(toolResult: unknown): ReturnedCitation[] | undefined {
  const rawCitations = readCitationsField(toolResult);
  if (!Array.isArray(rawCitations)) return undefined;
  const citations: ReturnedCitation[] = [];
  for (const citation of rawCitations) {
    if (isReturnedCitation(citation)) {
      citations.push({
        entityType: citation.entityType,
        entityId: citation.entityId,
        fragment: citation.fragment,
      });
    }
  }
  return citations;
}

/**
 * Extract every tool call as `{ toolName, args, citations }` (in call
 * order, duplicates kept) off a real `agent.generate()` result's
 * `toolResults` array (#294) — a strict superset of
 * {@link extractToolNamesFromToolResults} that also carries the
 * model-supplied arguments and that call's own returned citations, so
 * `scoreToolRouting` (`./scorers/tool-routing.ts`) can assert on actual
 * tool INPUT (e.g. `search-career` was called with `sourceTypes:
 * ["story"]`), call SEQUENCE, and — per the #294 independent-review
 * correction, finding 1 — whether that specific call's result was actually
 * non-empty, not just which tool names appeared somewhere in the trace.
 * Tolerant by design, same as `extractToolNamesFromToolResults` above: a
 * malformed entry (missing or non-string `toolName`) is skipped, never
 * thrown on; a call with no `args` field yields `args: undefined`, and one
 * whose result shape doesn't parse yields `citations: undefined`.
 */
export function extractToolCallsFromToolResults(toolResults: readonly unknown[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const toolResult of toolResults) {
    if (typeof toolResult !== "object" || toolResult === null) continue;
    const entry = toolResult as Record<string, unknown>;
    const payload =
      typeof entry.payload === "object" && entry.payload !== null
        ? (entry.payload as Record<string, unknown>)
        : undefined;
    const toolName = typeof payload?.toolName === "string" ? payload.toolName : entry.toolName;
    if (typeof toolName !== "string") continue;
    const citations = readOwnCitations(toolResult);
    calls.push({
      toolName,
      args: payload?.args ?? (entry as Record<string, unknown>).args,
      ...(citations !== undefined ? { citations } : {}),
    });
  }
  return calls;
}

/**
 * Build the sanitized {@link CaseFailureInfo} a real `runCase` throws inside
 * an {@link EvalCaseError} when `agent.generate()` fails terminally (#307
 * C5) — `./retry.ts`'s `classifyProviderError` is the single classification
 * boundary this shares with every `RetryAttemptRecord` (#307 second
 * independent-review correction, 2nd round, finding 1): never the caught
 * error's own raw `.name`/`.message` (which can embed a secret in a shape no
 * redaction regex is guaranteed to catch), only a controlled classification
 * and the numeric status code, plus whatever per-attempt trace `./retry.ts`'s
 * `onAttempt` collected for this case's own request(s). Never throws.
 */
export function describeCaseFailure(
  error: unknown,
  attempts: readonly RetryAttemptRecord[],
): CaseFailureInfo {
  const info = classifyProviderError(error);
  return {
    ...(info.statusCode !== undefined ? { statusCode: info.statusCode } : {}),
    errorName: info.errorName,
    errorMessage: info.errorMessage,
    attempts: [...attempts],
  };
}

/** Per-case scratch space for the retry policy's `onAttempt` records (#307 C5) — see {@link createCaseAttemptTracker}. */
export interface CaseAttemptTracker {
  /** Clear the trace — called right before a new case's `agent.generate()` call. */
  reset(): void;
  /** The current case's attempts so far, in order. */
  attempts(): RetryAttemptRecord[];
}

/**
 * Build the mutable per-case attempt scratch space `main()`'s shared
 * `retryPolicy.onAttempt` writes into and {@link createRunCase} reads back
 * (#307 C5). A closure, not a class, since nothing outside this module ever
 * needs more than the two methods on {@link CaseAttemptTracker}. Cases run
 * strictly sequentially (`./runner.ts` awaits each `runCase` before
 * starting the next), so one shared mutable array is safe — there is never
 * a second case's attempts interleaved with the current one's.
 */
export function createCaseAttemptTracker(): CaseAttemptTracker & {
  onAttempt: (record: RetryAttemptRecord) => void;
  /**
   * Compute (and reserve) the `requestIndex` the attempt about to run WILL
   * get, BEFORE `operation()` runs (second independent Codex review,
   * issuecomment-5608823305, finding 3) — `./cli.ts`'s
   * `createEvalRetryPolicy` calls this from `./retry.ts`'s `beforeAttempt`
   * hook, which fires strictly before every attempt including a retry, and
   * hands the returned value to the limiter's own observability collector
   * (`ObservabilityCollector.beginRequest`) so that request's persisted
   * telemetry carries the SAME identity this tracker's own `onAttempt`
   * records for it afterward — explicit linkage, not merely matching
   * ordering. Uses the exact same "a fresh `attempt: 1` starts a new
   * request" rule `onAttempt` falls back to when called without a matching
   * `beginAttempt` (e.g. a direct unit test of `onAttempt` alone), so
   * calling both for the same attempt never double-increments.
   */
  beginAttempt: (attempt: number) => number;
} {
  let attempts: RetryAttemptRecord[] = [];
  let requestIndex = 0;
  let pendingRequestIndex: number | null = null;

  function requestIndexFor(attempt: number): number {
    if (pendingRequestIndex !== null) {
      const value = pendingRequestIndex;
      pendingRequestIndex = null;
      return value;
    }
    // #307 second independent-review correction, 2nd round, finding 3: a
    // fresh `attempt: 1` always marks the start of a NEW logical request —
    // attempts within one request are strictly sequential (cases run one at
    // a time, `./retry.ts`'s `run()` loop awaits each attempt before the
    // next), so `attempt` only ever resets back to 1 once the previous
    // request's own `run()` call has already concluded. `requestIndex`
    // turns that observation into a stable identity threaded onto every
    // record this case's report carries.
    if (attempt === 1) requestIndex += 1;
    return requestIndex;
  }

  return {
    reset: () => {
      attempts = [];
      requestIndex = 0;
      pendingRequestIndex = null;
    },
    attempts: () => attempts,
    beginAttempt: (attempt) => {
      if (attempt === 1) requestIndex += 1;
      pendingRequestIndex = requestIndex;
      return requestIndex;
    },
    onAttempt: (record) => {
      attempts.push({ ...record, requestIndex: requestIndexFor(record.attempt) });
    },
  };
}

/**
 * The slice of Mastra's `Agent` this module actually calls —
 * `agent.generate(question, { modelSettings: { maxRetries: 0 } })`. Narrowed
 * so {@link createRunCase} is testable with a fake, never a real `Agent`.
 *
 * #307 second independent-review correction, finding 2: the real
 * `Agent.generate()` has NO top-level `maxRetries` option — it lives under
 * `modelSettings` (confirmed against the real `@mastra/core` `Agent` type;
 * `retry.test.ts`'s "nested-retry proof" suite wires one directly). The
 * previous `{ maxRetries?: number }` shape here compiled (this interface
 * was permissive enough to accept it) but meant nothing to a real `Agent` —
 * Mastra's own nested per-step retry was NEVER actually disabled in
 * production, only in this module's own fake-`generate` unit tests.
 */
export interface GenerateLike {
  generate: (
    question: string,
    options?: { modelSettings?: { maxRetries?: number } },
  ) => Promise<{
    text: string;
    toolResults?: unknown[];
    totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  }>;
}

/**
 * Read `result.totalUsage` as a fully-known usage triple, or `undefined` if
 * any field is missing — never partially trusted (#307 second
 * independent-review correction, finding 4).
 */
function reportedUsageOf(
  totalUsage: Awaited<ReturnType<GenerateLike["generate"]>>["totalUsage"],
): { inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
  if (
    typeof totalUsage?.inputTokens !== "number" ||
    typeof totalUsage?.outputTokens !== "number" ||
    typeof totalUsage?.totalTokens !== "number"
  ) {
    return undefined;
  }
  return {
    inputTokens: totalUsage.inputTokens,
    outputTokens: totalUsage.outputTokens,
    totalTokens: totalUsage.totalTokens,
  };
}

/**
 * Resolve a case's final `{ usage, usageKnown }` from `agent.generate()`'s
 * own reported `totalUsage` plus the tracker's own per-attempt trace (#307
 * second independent-review correction, finding 4; review
 * issuecomment-5577656024, finding 2). Split out of `createRunCase` purely
 * to keep that function's cognitive complexity under this repo's Biome
 * limit — no behavior change from the inline version this replaces
 * (cli.test.ts's usage-fallback suite covers every branch either way).
 */
function resolveCaseUsage(
  reportedUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined,
  attempts: readonly RetryAttemptRecord[],
): {
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  usageKnown: boolean;
} {
  const attemptSummary = sumKnownUsage(attempts);
  // #307 review issuecomment-5577656024, finding 2: when an attempt trace
  // EXISTS but is incomplete (some attempt's own usage is unknown — e.g. a
  // multi-step case whose 2nd step's provider result carried no readable
  // usage), a well-formed `result.totalUsage` must NOT be trusted as
  // complete: Mastra's own aggregation can silently drop that step's
  // contribution while still returning a fully-numeric, innocent-looking
  // total — incorrectly certifying a PARTIAL sum as the complete one. Only
  // when there's no attempt-level visibility at all (`attempts` empty — e.g.
  // a `GenerateLike` stub not wired to this module's own attempt tracker) is
  // `reportedUsage` trusted outright, same as before.
  const attemptsIncomplete = attempts.length > 0 && !attemptSummary.complete;
  const fallbackUsage = attemptSummary.usage !== "unknown" ? attemptSummary.usage : undefined;
  // The known partial sum is preserved in `usage` even when incomplete —
  // never a fabricated zero — while `usageKnown` alone carries whether it's
  // COMPLETE, so a report consumer never mistakes a partial sum for the
  // whole picture (and never double-counts: `fallbackUsage` sums each
  // attempt's own step total exactly once).
  const usage = attemptsIncomplete ? fallbackUsage : (reportedUsage ?? fallbackUsage);
  const usageKnown =
    !attemptsIncomplete && (reportedUsage !== undefined || attemptSummary.complete);
  return { usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, usageKnown };
}

/**
 * Build the real `RunnerDeps.runCase` (#307 C5): calls `agent.generate`
 * with `modelSettings: { maxRetries: 0 }` — Mastra's own nested
 * per-generate retry actually disabled (#307 second independent-review
 * correction, finding 2 — the prior top-level `maxRetries: 0` meant
 * nothing to the real `Agent`), since `./retry.ts`'s `createRetryPolicy`
 * (wrapping the model `agent` was built with — see `main()`) is the
 * single retry owner now. A rejection that reaches here already
 * exhausted every retry that policy would attempt, so it is always
 * terminal: wrapped in an `EvalCaseError` carrying `tracker`'s recorded
 * attempts, never retried again here and never used to regenerate an
 * answer.
 */
export function createRunCase(
  agent: GenerateLike,
  tracker: CaseAttemptTracker,
  options: {
    /**
     * Called with the case's `question` BEFORE `agent.generate` runs (#307
     * Codex review, finding 4) — `main()` wires this to
     * `observability.startCase(caseId)` so every provider request the
     * limiter admits while this case runs is correlated to it. Optional so
     * every existing `createRunCase` caller/test keeps working unchanged.
     */
    onCaseStart?: (question: string) => void;
  } = {},
): (question: string) => Promise<CaseRunResult> {
  return async (question) => {
    options.onCaseStart?.(question);
    tracker.reset();
    let result: Awaited<ReturnType<GenerateLike["generate"]>>;
    try {
      result = await agent.generate(question, { modelSettings: { maxRetries: 0 } });
    } catch (error) {
      // #307 second independent-review correction, 2nd round, finding 2: a
      // BudgetExceededError (thrown by `./retry.ts`'s `beforeAttempt` hook
      // before a request that would cross the shared budget) is the RUNNER's
      // own decision to stop, not a case's provider call failing — it must
      // propagate as-is so `./runner.ts` can tell the two apart, never
      // wrapped in an EvalCaseError.
      //
      // #307 review issuecomment-5577656024, finding 1: attach THIS case's
      // own tracker attempts before rethrowing — without it, a request that
      // succeeded (known usage) before a LATER request in the same case got
      // stopped by the budget guard left `./runner.ts` with no way to
      // recover that known usage, silently losing it from the report's
      // totals. Mutating the caught error in place (rather than throwing a
      // new one) preserves its identity for a caller narrowing on it.
      if (error instanceof BudgetExceededError) {
        error.attempts = tracker.attempts();
        throw error;
      }

      const failure = describeCaseFailure(error, tracker.attempts());
      // #307 second independent-review correction, 2nd round, finding 1:
      // never interpolate the caught error's own raw message here — only
      // `failure`'s already-controlled classification.
      throw new EvalCaseError(
        `Eval case failed after ${failure.attempts.length} attempt(s): ${failure.errorName} (${failure.errorMessage})`,
        failure,
      );
    }
    const attempts = tracker.attempts();
    // #307 second independent-review correction, finding 4: a missing/
    // incomplete `totalUsage` must never silently become a fabricated
    // "0 tokens spent" — fall back to the real per-attempt usage this
    // module's own retry policy already collected, and only report the
    // zero (explicitly flagged `usageKnown: false`) when THAT is also
    // unknown.
    const { usage, usageKnown } = resolveCaseUsage(reportedUsageOf(result.totalUsage), attempts);
    return {
      answer: result.text,
      toolCitations: extractCitationsFromToolResults(result.toolResults ?? []),
      toolCalls: extractToolCallsFromToolResults(result.toolResults ?? []),
      usage,
      usageKnown,
      attempts,
    };
  };
}

/**
 * Build the single shared retry policy `main()` wires the real model
 * through (#307 second independent-review correction, 2nd round, finding
 * 2): a `createBudgetGuard` fed by every attempt's own known usage
 * (`onAttempt`), consulted via `beforeAttempt` BEFORE every request this
 * policy makes — including a later step of the same case and the first
 * request of the next one, since one instance is shared for the whole run.
 * Extracted out of `main()` so this wiring is unit-testable with zero real
 * model calls, the same "pure/testable piece pulled out of `main()`"
 * pattern `createCaseAttemptTracker`/`createRunCase` already establish in
 * this file.
 */
export function createEvalRetryPolicy(options: {
  modelId: string;
  maxTotalTokens: number;
  maxCostUsd: number;
  attemptTracker: CaseAttemptTracker & {
    onAttempt: (record: RetryAttemptRecord) => void;
    beginAttempt: (attempt: number) => number;
  };
  onWarn?: (message: string) => void;
  /**
   * Called with `{requestIndex, attempt}` right before this attempt's
   * `operation()` runs — never when the budget guard blocks it first
   * (second independent Codex review, issuecomment-5608823305, finding 3).
   * `main()` wires this to `ObservabilityCollector.beginRequest` so the
   * limiter's own record for this exact attempt carries the SAME identity
   * `attemptTracker`'s own trace does, joinable deterministically instead
   * of merely by matching completion order.
   */
  onBeforeAttempt?: (requestIndex: number, attempt: number) => void;
}): RetryPolicy {
  const pricing = getModelPricing(options.modelId);
  const budgetGuard = createBudgetGuard({
    maxTotalTokens: options.maxTotalTokens,
    maxCostUsd: options.maxCostUsd,
  });

  return createRetryPolicy({
    onAttempt: (record) => {
      options.attemptTracker.onAttempt(record);
      if (typeof record.usage === "object") {
        budgetGuard.recordUsage(record.usage, pricing);
      }
      if (record.outcome !== "success") {
        options.onWarn?.(
          `[retry] attempt ${record.attempt} ${record.outcome}` +
            (record.statusCode !== undefined ? ` (status ${record.statusCode})` : "") +
            (record.errorMessage ? `: ${record.errorMessage}` : ""),
        );
      }
    },
    beforeAttempt: (attempt) => {
      // Budget first: a request the guard is about to block never gets a
      // requestIndex reserved or an `onBeforeAttempt` call — it's not going
      // to reach the limiter at all (see the doc comment on
      // `onBeforeAttempt` above).
      budgetGuard.assertNotExceeded();
      const requestIndex = options.attemptTracker.beginAttempt(attempt);
      options.onBeforeAttempt?.(requestIndex, attempt);
    },
  });
}

/** The pure, testable pieces of `main()`'s report-summary console output — see {@link summarizeReportForCli}. */
export interface ReportCliSummary {
  /**
   * Lines describing WHY the run stopped short of every selected case, if
   * at all — empty when `report.complete` is `true`. Distinguishes a budget
   * stop from a terminal provider failure (#307 issuecomment-5591843129
   * assignment B / diagnosis 5591743584 (c)) rather than labeling every
   * incomplete run "a terminal provider failure" the way `main()` did
   * before this fix.
   */
  executionFailureLines: string[];
  /**
   * The genuine scorer/threshold failure messages — `report.verdict.failures`
   * with the execution-cause messages (budget/provider-failure/unexecuted)
   * that already appear in `executionFailureLines` removed, so a run that
   * ALSO has a real assertion/completeness miss never reads as if the only
   * problem were the execution stop. Relies on `./report.ts`'s own,
   * documented ordering — `collectExecutionFailures`' entries are always
   * appended AFTER the score-threshold failures — rather than re-deriving or
   * duplicating that formatting here.
   */
  thresholdFailureLines: string[];
  /** Mirrors `report.verdict.passed` — whether `main()` should exit non-zero. */
  passed: boolean;
}

/**
 * Build the human-readable, execution-vs-threshold-labeled summary `main()`
 * prints for a finished eval run (#307 issuecomment-5591843129 assignment B
 * / diagnosis 5591743584 (c)). Pure and exported so it's unit-testable
 * without a real model call — the same "pure/testable piece pulled out of
 * `main()`" pattern the rest of this module already follows (see this
 * file's module docs).
 */
export function summarizeReportForCli(report: EvalReport): ReportCliSummary {
  const executionFailureLines: string[] = [];

  // A budget stop is the RUNNER's own decision to stop, never a provider
  // call failing — labeled and printed distinctly from a terminal provider
  // failure below, never folded into "FAILED threshold checks".
  if (report.budgetExceeded) {
    executionFailureLines.push(`Eval suite stopped on budget: ${report.budgetExceeded.message}`);
    for (const partialCase of report.partialCases) {
      executionFailureLines.push(
        `  - ${partialCase.id} was aborted mid-flight after ${partialCase.attempts.length} attempt(s)`,
      );
    }
  }

  if (report.failedCases.length > 0) {
    executionFailureLines.push("Eval suite stopped early after a terminal provider failure:");
    for (const failedCase of report.failedCases) {
      executionFailureLines.push(
        `  - ${failedCase.id} failed after ${failedCase.attempts.length} attempt(s)` +
          (failedCase.statusCode !== undefined ? ` (status ${failedCase.statusCode})` : "") +
          `: ${failedCase.errorMessage}`,
      );
    }
  }

  if (report.unexecutedCaseIds.length > 0) {
    executionFailureLines.push(`  - never ran: ${report.unexecutedCaseIds.join(", ")}`);
  }

  // `./report.ts`'s `buildReport` always appends the execution-cause
  // failures (in this same failedCases -> unexecutedCaseIds -> partialCases
  // -> budgetExceeded order) AFTER the genuine score-threshold failures, so
  // the genuine ones are always the leading slice of this exact length —
  // counting them (from the same fields used above) tells them apart
  // without re-deriving or duplicating `./report.ts`'s own message text.
  const executionFailureCount =
    report.failedCases.length +
    (report.unexecutedCaseIds.length > 0 ? 1 : 0) +
    report.partialCases.length +
    (report.budgetExceeded ? 1 : 0);
  const thresholdFailureLines = report.verdict.failures.slice(
    0,
    report.verdict.failures.length - executionFailureCount,
  );

  return { executionFailureLines, thresholdFailureLines, passed: report.verdict.passed };
}

/** The console-like methods {@link printReportSummary} writes through — matches `console.log`/`console.error`'s call shape closely enough for a test double. */
export interface ReportSummaryIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Print {@link summarizeReportForCli}'s labeled summary for `report` through
 * the injected `io` (real `console.log`/`console.error` from `main()`, a
 * `vi.fn()` spy pair from `cli.test.ts`) and return whether the run passed —
 * the same dependency-injection seam `createRunCase`/`runEvalSuite` already
 * use in this package, so `main()`'s own printing/exit-status decision is
 * unit-testable without a real model call even though `main()` itself stays
 * untested per this module's docs.
 */
export function printReportSummary(report: EvalReport, io: ReportSummaryIo): boolean {
  const summary = summarizeReportForCli(report);

  for (const line of summary.executionFailureLines) {
    io.error(line);
  }

  if (summary.thresholdFailureLines.length > 0) {
    io.error("Eval suite FAILED threshold checks:");
    for (const failure of summary.thresholdFailureLines) {
      io.error(`  - ${failure}`);
    }
  }

  if (summary.passed) {
    io.log("Eval suite passed every threshold.");
  }

  return summary.passed;
}

/** The console-like methods {@link persistEvalArtifacts} writes through — the real `console.log`/`console.error` from `main()`, or a `vi.fn()` spy pair from `cli.test.ts`. */
export interface PersistEvalArtifactsIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Write the observability sidecar (best-effort, non-fatal on failure) and,
 * when `report` is supplied, the durable report artifact — extracted out of
 * `main()` (third independent Codex review, issuecomment-5620134895,
 * finding 3) so the "a sidecar write failure must never prevent the durable
 * report from persisting" contract (second independent Codex review,
 * issuecomment-5608823305, finding 3's tail) is unit-testable through the
 * SAME wiring `main()` actually calls, rather than a reimplementation of
 * this logic hand-simulated inside a test. `report` is omitted when
 * `runEvalSuite` itself threw before producing one — the sidecar is still
 * written (the limiter's own observability data is never lost just because
 * the run failed), but there is no report to persist. The `writeFile`/`io`
 * dependency-injection seam matches every other testable piece in this
 * module (`createRunCase`, `printReportSummary`, ...).
 */
export async function persistEvalArtifacts(params: {
  report?: EvalReport;
  observabilityLog: ObservabilityLog;
  reportPath: string;
  observabilityPath: string;
  writeFile: (path: string, data: string) => Promise<void>;
  io: PersistEvalArtifactsIo;
}): Promise<void> {
  // Second independent Codex review (issuecomment-5608823305), finding 3's
  // tail: this standalone sidecar is a DUPLICATE of the exact same data
  // embedded in `report.observability` — a failure writing it (disk full,
  // permission error) must never prevent the DURABLE report artifact from
  // being written. Caught here so a throw can never propagate past this
  // function and skip the report write below.
  try {
    await params.writeFile(
      params.observabilityPath,
      `${JSON.stringify(params.observabilityLog, null, 2)}\n`,
    );
    params.io.log(
      `Observability log written to ${params.observabilityPath} ` +
        `(${params.observabilityLog.requestCount} request(s)).`,
    );
  } catch (error) {
    params.io.error(
      `Failed to write observability sidecar ${params.observabilityPath} ` +
        `(non-fatal — the same data is still embedded in ${params.reportPath}): ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (params.report) {
    await params.writeFile(params.reportPath, `${JSON.stringify(params.report, null, 2)}\n`);
  }
}

async function main(): Promise<void> {
  const envConfig = resolveRunnerEnvConfig();
  const modelId = resolveChatModelConfig().modelId;
  const cases = filterCasesByIds(EVAL_CASES, envConfig.caseIds);

  console.log(
    `Running eval suite: up to ${envConfig.maxCases} case(s)` +
      (envConfig.caseIds ? ` (filtered to: ${envConfig.caseIds.join(", ")})` : "") +
      `, max ${envConfig.maxTotalTokens} tokens / $${envConfig.maxCostUsd} budget, ` +
      `${envConfig.rpmLimit} model requests/min, model ${modelId}.`,
  );

  // #282: the throttle wraps the MODEL, not the case loop — one eval case
  // is 2-3 provider requests (model call -> tool call -> composing model
  // call), so only a model-boundary limiter counts what the provider
  // counts. Built once and shared by every case, since the sliding window
  // has to span the whole run.
  //
  // #307 C5: `./retry.ts`'s `createRetryPolicy` is now the SINGLE retry
  // owner for eval provider calls — this limiter's own 429 retry is
  // disabled (`maxRetries: 0`) and so is Mastra's own per-generate retry
  // (`createRunCase` passes `{ modelSettings: { maxRetries: 0 } }` to
  // `agent.generate` — see finding 2's doc comment there for why the
  // top-level shape used before #307's second correction did nothing), so
  // nothing retries underneath the policy. See `./retry.ts`'s module docs
  // for the full classification (#307 Codex review, finding 4 — corrected
  // this stale summary: a 429 is retried ONLY when the provider's own
  // structured evidence unambiguously names a per-minute quota AND carries a
  // trustworthy Retry-After/RetryInfo hint; every other 429 — daily, mixed,
  // unknown, malformed, or one with no usable hint — stops immediately.
  // 502/503/504/timeout retry, bounded; everything else is permanent).
  // #307 options 1+2 / #307 Codex review, finding 4: every real admitted
  // request's sanitized timing — never a raw error body/header/credential —
  // is collected here, correlated to whichever case is currently running
  // (`observability.startCase`, wired into `createRunCase` below), and
  // embedded in `envConfig.reportPath` (the SAME artifact both
  // `agent-evals.yml` and `release-readiness.yml` already upload — a
  // separate `eval-observability.json` is never retained by either
  // workflow) after the run, regardless of how the run ends (success,
  // budget stop, or terminal failure). Still ALSO written to its own file
  // for convenient local inspection without parsing the full report.
  const observability = createObservabilityCollector();
  const runId = randomUUID();
  const observabilityMeta: ObservabilityLogMeta = {
    runId,
    modelId,
    configuredRpmLimit: envConfig.rpmLimit,
    configuredWindowMs: RATE_LIMIT_WINDOW_MS,
  };
  const limiter = createRequestRateLimiter({
    rpmLimit: envConfig.rpmLimit,
    maxRetries: 0,
    onRequest: observability.onRequest,
  });

  const attemptTracker = createCaseAttemptTracker();
  const retryPolicy = createEvalRetryPolicy({
    modelId,
    maxTotalTokens: envConfig.maxTotalTokens,
    maxCostUsd: envConfig.maxCostUsd,
    attemptTracker,
    onWarn: (message) => console.warn(message),
    // Second independent Codex review (issuecomment-5608823305), finding 3:
    // hand the limiter's own observability collector the SAME
    // requestIndex/attempt identity `attemptTracker` computed for this
    // exact attempt, before it runs — explicit correlation instead of two
    // separately-derived counters that merely happen to march in lockstep.
    onBeforeAttempt: (requestIndex, attempt) => observability.beginRequest(requestIndex, attempt),
  });
  const model = createRetryingModel({
    model: createRateLimitedModel({ model: toLanguageModel(createChatModel()), limiter }),
    retryPolicy,
  });
  const agent = getInterviewAgent({ model });

  let report: EvalReport | undefined;
  let observabilityLog: ObservabilityLog;
  try {
    report = await runEvalSuite(
      {
        cases,
        budget: {
          maxCases: envConfig.maxCases,
          maxTotalTokens: envConfig.maxTotalTokens,
          maxCostUsd: envConfig.maxCostUsd,
        },
        promptVersion: PROMPT_VERSION,
        modelId,
        thresholds: EVAL_THRESHOLDS,
      },
      {
        runCase: createRunCase(agent, attemptTracker, {
          onCaseStart: (question) => {
            const caseId = cases.find((evalCase) => evalCase.question === question)?.id ?? question;
            observability.startCase(caseId);
          },
        }),
      },
    );
    // #307 Codex review, finding 4: embed the SAME observability log into
    // the durable report artifact. Only reachable once `runEvalSuite`
    // returns without throwing — see `persistEvalArtifacts` below for what
    // happens when it doesn't.
    report = { ...report, observability: observability.log(observabilityMeta) };
  } finally {
    // #307 options 1+2: written regardless of how the run ends (success,
    // budget stop, or a terminal error propagating out of runEvalSuite) —
    // the observability log is about what the limiter actually did, not
    // about the run's own outcome. `report` stays `undefined` here when
    // `runEvalSuite` threw before this `finally` reassigned it above, so
    // `persistEvalArtifacts` writes only the sidecar in that case — third
    // independent Codex review (issuecomment-5620134895), finding 3: this is
    // the ACTUAL wiring `cli.test.ts`'s composed suite exercises, not a
    // reimplementation of it.
    observabilityLog = observability.log(observabilityMeta);
    await persistEvalArtifacts({
      report,
      observabilityLog,
      reportPath: envConfig.reportPath,
      observabilityPath: envConfig.observabilityPath,
      writeFile: (path, data) => writeFile(path, data, "utf8"),
      io: { log: console.log, error: console.error },
    });
  }

  console.log(`Report written to ${envConfig.reportPath}`);
  console.log(
    `Aggregates — groundedness: ${report.aggregates.groundedness.mean.toFixed(4)}, ` +
      `gap honesty: ${report.aggregates.gapHonesty.mean.toFixed(4)}, ` +
      `relevance: ${report.aggregates.relevance.mean.toFixed(4)}.`,
  );
  console.log(
    `Total tokens: ${report.totals.totalTokens}, estimated cost: $${report.totals.costUsd.toFixed(4)}.`,
  );

  // #307 C5 / #307 issuecomment-5591843129 assignment B / diagnosis
  // 5591743584 (c): a terminal case failure no longer throws — it comes
  // back as an incomplete report (failedCases/unexecutedCaseIds populated,
  // verdict.passed false). `printReportSummary` labels a budget stop
  // distinctly from a terminal provider failure (both used to print as
  // "STOPPED early after a terminal provider failure" here, even when the
  // run never made a failing provider call) and keeps the execution-cause
  // message out of "FAILED threshold checks" — while still printing any
  // GENUINE scorer/threshold failure that also occurred, so a run stopped
  // on budget that also had a real assertion/completeness miss never reads
  // as if the budget were the only problem.
  const passed = printReportSummary(report, { log: console.log, error: console.error });
  if (!passed) {
    process.exitCode = 1;
    return;
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main().catch((error: unknown) => {
    console.error("Eval suite run failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
