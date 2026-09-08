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
  toLanguageModel,
} from "./rate-limit.js";
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
} {
  let attempts: RetryAttemptRecord[] = [];
  let requestIndex = 0;
  return {
    reset: () => {
      attempts = [];
      requestIndex = 0;
    },
    attempts: () => attempts,
    // #307 second independent-review correction, 2nd round, finding 3: a
    // fresh `attempt: 1` always marks the start of a NEW logical request —
    // attempts within one request are strictly sequential (cases run one at
    // a time, `./retry.ts`'s `run()` loop awaits each attempt before the
    // next), so `attempt` only ever resets back to 1 once the previous
    // request's own `run()` call has already concluded. `requestIndex`
    // turns that observation into a stable identity threaded onto every
    // record this case's report carries.
    onAttempt: (record) => {
      if (record.attempt === 1) requestIndex += 1;
      attempts.push({ ...record, requestIndex });
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
): (question: string) => Promise<CaseRunResult> {
  return async (question) => {
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
      if (error instanceof BudgetExceededError) throw error;

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
    // unknown. #307 second independent-review correction, 2nd round,
    // finding 3: the fallback must not be treated as known unless it is
    // COMPLETE (every attempt carried known usage), not just non-empty.
    const reportedUsage = reportedUsageOf(result.totalUsage);
    const fallback = reportedUsage ? undefined : sumKnownUsage(attempts);
    const fallbackUsage =
      fallback && fallback.usage !== "unknown" && fallback.complete ? fallback.usage : undefined;
    const usage = reportedUsage ?? fallbackUsage;
    return {
      answer: result.text,
      toolCitations: extractCitationsFromToolResults(result.toolResults ?? []),
      toolCalls: extractToolCallsFromToolResults(result.toolResults ?? []),
      usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      usageKnown: usage !== undefined,
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
  attemptTracker: CaseAttemptTracker & { onAttempt: (record: RetryAttemptRecord) => void };
  onWarn?: (message: string) => void;
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
    beforeAttempt: () => budgetGuard.assertNotExceeded(),
  });
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
  // for the full classification (429 stops immediately; 502/503/504/
  // timeout retry, bounded; everything else is permanent).
  const limiter = createRequestRateLimiter({
    rpmLimit: envConfig.rpmLimit,
    maxRetries: 0,
  });

  const attemptTracker = createCaseAttemptTracker();
  const retryPolicy = createEvalRetryPolicy({
    modelId,
    maxTotalTokens: envConfig.maxTotalTokens,
    maxCostUsd: envConfig.maxCostUsd,
    attemptTracker,
    onWarn: (message) => console.warn(message),
  });
  const model = createRetryingModel({
    model: createRateLimitedModel({ model: toLanguageModel(createChatModel()), limiter }),
    retryPolicy,
  });
  const agent = getInterviewAgent({ model });

  const report = await runEvalSuite(
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
    { runCase: createRunCase(agent, attemptTracker) },
  );

  await writeFile(envConfig.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Report written to ${envConfig.reportPath}`);
  console.log(
    `Aggregates — groundedness: ${report.aggregates.groundedness.mean.toFixed(4)}, ` +
      `gap honesty: ${report.aggregates.gapHonesty.mean.toFixed(4)}, ` +
      `relevance: ${report.aggregates.relevance.mean.toFixed(4)}.`,
  );
  console.log(
    `Total tokens: ${report.totals.totalTokens}, estimated cost: $${report.totals.costUsd.toFixed(4)}.`,
  );

  // #307 C5: a terminal case failure no longer throws — it comes back as an
  // incomplete report (failedCases/unexecutedCaseIds populated,
  // verdict.passed false). Surface that distinctly from an ordinary
  // threshold miss so a CI log doesn't read "eval failed" without saying
  // WHY: the suite ran to completion but scored poorly, versus the suite
  // was cut short by a provider failure.
  if (!report.complete) {
    console.error("Eval suite STOPPED early after a terminal provider failure:");
    for (const failedCase of report.failedCases) {
      console.error(
        `  - ${failedCase.id} failed after ${failedCase.attempts.length} attempt(s)` +
          (failedCase.statusCode !== undefined ? ` (status ${failedCase.statusCode})` : "") +
          `: ${failedCase.errorMessage}`,
      );
    }
    if (report.unexecutedCaseIds.length > 0) {
      console.error(`  - never ran: ${report.unexecutedCaseIds.join(", ")}`);
    }
  }

  if (!report.verdict.passed) {
    console.error("Eval suite FAILED threshold checks:");
    for (const failure of report.verdict.failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Eval suite passed every threshold.");
}

const isDirectInvocation =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main().catch((error: unknown) => {
    console.error("Eval suite run failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
