import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "./budget.js";
import {
  type CaseAttemptTracker,
  createCaseAttemptTracker,
  createEvalRetryPolicy,
  createRunCase,
  describeCaseFailure,
  extractCitationsFromToolResults,
  extractToolCallsFromToolResults,
  extractToolNamesFromToolResults,
  filterCasesByIds,
  resolveRunnerEnvConfig,
} from "./cli.js";
import type { EvalCase } from "./dataset/schema.js";
import { DEFAULT_EVAL_RPM_LIMIT, FREE_TIER_RPM_CEILING } from "./rate-limit.js";
import type { RetryAttemptRecord } from "./retry.js";
import { EvalCaseError } from "./runner.js";

describe("resolveRunnerEnvConfig", () => {
  it("falls back to conservative defaults when env is empty", () => {
    const config = resolveRunnerEnvConfig({});
    expect(config.maxCases).toBeGreaterThan(0);
    expect(config.maxTotalTokens).toBeGreaterThan(0);
    expect(config.maxCostUsd).toBeGreaterThan(0);
    expect(config.rpmLimit).toBeGreaterThan(0);
    expect(config.reportPath.length).toBeGreaterThan(0);
    expect(config.caseIds).toBeUndefined();
  });

  it("reads every override from env", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_MAX_CASES: "3",
      EVAL_MAX_TOTAL_TOKENS: "1000",
      EVAL_MAX_COST_USD: "0.02",
      EVAL_RPM_LIMIT: "5",
      EVAL_REPORT_PATH: "custom-report.json",
      EVAL_CASE_IDS: "grounded-nodejs-experience,gap-golang",
    });
    expect(config).toEqual({
      maxCases: 3,
      maxTotalTokens: 1000,
      maxCostUsd: 0.02,
      rpmLimit: 5,
      reportPath: "custom-report.json",
      caseIds: ["grounded-nodejs-experience", "gap-golang"],
    });
  });

  it("takes EVAL_RPM_LIMIT's default from the single documented quota source, not a literal (#282)", () => {
    // The limiter, this config and the README quota table all read the same
    // constant, so they cannot drift apart.
    expect(resolveRunnerEnvConfig({}).rpmLimit).toBe(DEFAULT_EVAL_RPM_LIMIT);
    expect(DEFAULT_EVAL_RPM_LIMIT).toBeLessThan(FREE_TIER_RPM_CEILING);
  });

  it("ignores a non-numeric override and falls back to the default", () => {
    const config = resolveRunnerEnvConfig({ EVAL_MAX_CASES: "not-a-number" });
    expect(config.maxCases).toBeGreaterThan(0);
  });

  it("trims whitespace and drops empty entries from EVAL_CASE_IDS", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_CASE_IDS: " grounded-nodejs-experience , , gap-golang ,",
    });
    expect(config.caseIds).toEqual(["grounded-nodejs-experience", "gap-golang"]);
  });

  it("leaves caseIds undefined when EVAL_CASE_IDS is unset or blank", () => {
    expect(resolveRunnerEnvConfig({}).caseIds).toBeUndefined();
    expect(resolveRunnerEnvConfig({ EVAL_CASE_IDS: "   " }).caseIds).toBeUndefined();
  });
});

describe("filterCasesByIds", () => {
  const cases: readonly EvalCase[] = [
    {
      id: "grounded-nodejs-experience",
      category: "grounded",
      question: "What is his experience with Node.js?",
      gapHonestyDirection: "claimed",
    },
    {
      id: "gap-golang",
      category: "gap",
      question: "Does he have production Go (Golang) experience?",
      gapHonestyDirection: "gap",
    },
  ];

  it("returns every case unchanged when no filter is given", () => {
    expect(filterCasesByIds(cases, undefined)).toEqual(cases);
  });

  it("keeps only the cases whose id is in the filter, in dataset order", () => {
    const filtered = filterCasesByIds(cases, ["gap-golang", "grounded-nodejs-experience"]);
    expect(filtered.map((c) => c.id)).toEqual(["grounded-nodejs-experience", "gap-golang"]);
  });

  it("throws a clear error when a requested id does not exist in the dataset", () => {
    expect(() => filterCasesByIds(cases, ["not-a-real-case"])).toThrow(
      /unknown eval case id.*not-a-real-case/i,
    );
  });
});

describe("extractCitationsFromToolResults", () => {
  it("flattens citations off every tool result's DomainResult payload", () => {
    const toolResults = [
      {
        payload: {
          result: {
            data: {},
            citations: [{ entityType: "skill", entityId: "aws", label: "AWS" }],
          },
        },
      },
      {
        payload: {
          result: {
            data: {},
            citations: [{ entityType: "experience", entityId: "house-numbers", label: "HN" }],
          },
        },
      },
    ];

    const citations = extractCitationsFromToolResults(toolResults);
    expect(citations).toEqual([
      { entityType: "skill", entityId: "aws" },
      { entityType: "experience", entityId: "house-numbers" },
    ]);
  });

  it("skips a malformed tool result without throwing", () => {
    const toolResults = [{ payload: { result: null } }, { garbage: true }, undefined];
    expect(() => extractCitationsFromToolResults(toolResults)).not.toThrow();
    expect(extractCitationsFromToolResults(toolResults)).toEqual([]);
  });
});

describe("extractToolNamesFromToolResults (#75)", () => {
  it("collects every tool result's payload.toolName (the real ToolResultChunk shape), in order, including duplicates", () => {
    const toolResults = [
      {
        type: "tool-result",
        payload: { toolName: "get-experience", result: { data: [], citations: [] } },
      },
      {
        type: "tool-result",
        payload: { toolName: "search-career", result: { data: {}, citations: [] } },
      },
      {
        type: "tool-result",
        payload: { toolName: "search-career", result: { data: {}, citations: [] } },
      },
    ];

    expect(extractToolNamesFromToolResults(toolResults)).toEqual([
      "get-experience",
      "search-career",
      "search-career",
    ]);
  });

  it("falls back to a top-level toolName when there is no payload one", () => {
    const toolResults = [
      { toolName: "flat-shape" },
      { toolName: "top-level-ignored", payload: { toolName: "payload-wins" } },
    ];
    expect(extractToolNamesFromToolResults(toolResults)).toEqual(["flat-shape", "payload-wins"]);
  });

  it("returns an empty array for no tool calls", () => {
    expect(extractToolNamesFromToolResults([])).toEqual([]);
  });

  it("skips a tool result with no string toolName anywhere, without throwing", () => {
    const toolResults = [
      { payload: { toolName: 42 } },
      { garbage: true },
      undefined,
      { payload: { toolName: "real" } },
    ];
    expect(() => extractToolNamesFromToolResults(toolResults)).not.toThrow();
    expect(extractToolNamesFromToolResults(toolResults)).toEqual(["real"]);
  });
});

describe("extractToolCallsFromToolResults (#294)", () => {
  it("collects every tool result's { toolName, args } pair, in call order, including duplicates — scoreToolRouting (#294) needs actual arguments, not just names, to verify the sourceTypes: ['story'] contract", () => {
    const toolResults = [
      {
        type: "tool-result",
        payload: {
          toolName: "search-career",
          args: { query: "how does he lead", sourceTypes: ["story"] },
          result: { data: {}, citations: [] },
        },
      },
      {
        type: "tool-result",
        payload: {
          toolName: "list-career-stories",
          args: { id: "xogito-client-account-recovery" },
          result: { data: [], citations: [] },
        },
      },
    ];

    expect(extractToolCallsFromToolResults(toolResults)).toEqual([
      {
        toolName: "search-career",
        args: { query: "how does he lead", sourceTypes: ["story"] },
        citations: [],
      },
      {
        toolName: "list-career-stories",
        args: { id: "xogito-client-account-recovery" },
        citations: [],
      },
    ]);
  });

  /**
   * #294 independent-review correction, finding 1: `scoreToolRouting`'s
   * `search-career-story-scoped` check needs to distinguish "this call
   * returned a story" from "this call returned nothing", not just its
   * name/args — so each call's `citations` (the real `DomainResult.citations`
   * that specific call returned, same field `extractCitationsFromToolResults`
   * flattens across the whole run) has to be captured per call, not just
   * aggregated.
   */
  it("captures each call's own citations from its DomainResult payload (#294 independent-review correction)", () => {
    const toolResults = [
      {
        payload: {
          toolName: "search-career",
          args: { query: "x", sourceTypes: ["story"] },
          result: {
            data: [],
            citations: [{ entityType: "story", entityId: "mutual-informal-leadership" }],
          },
        },
      },
      {
        payload: {
          toolName: "search-career",
          args: { query: "y" },
          result: { data: [], citations: [] },
        },
      },
    ];

    expect(extractToolCallsFromToolResults(toolResults)).toEqual([
      {
        toolName: "search-career",
        args: { query: "x", sourceTypes: ["story"] },
        citations: [{ entityType: "story", entityId: "mutual-informal-leadership" }],
      },
      { toolName: "search-career", args: { query: "y" }, citations: [] },
    ]);
  });

  it("leaves citations undefined when a tool result's shape has no parseable citations array", () => {
    const toolResults = [{ payload: { toolName: "get-experience", args: {} } }];
    const [call] = extractToolCallsFromToolResults(toolResults);
    expect(call?.citations).toBeUndefined();
  });

  it("falls back to a top-level toolName/args when there is no payload one", () => {
    const toolResults = [{ toolName: "flat-shape", args: { q: 1 } }];
    expect(extractToolCallsFromToolResults(toolResults)).toEqual([
      { toolName: "flat-shape", args: { q: 1 } },
    ]);
  });

  it("defaults args to undefined when absent, and returns an empty array for no tool calls", () => {
    expect(extractToolCallsFromToolResults([])).toEqual([]);
    expect(extractToolCallsFromToolResults([{ payload: { toolName: "no-args-tool" } }])).toEqual([
      { toolName: "no-args-tool", args: undefined },
    ]);
  });

  it("skips a tool result with no string toolName anywhere, without throwing", () => {
    const toolResults = [{ payload: { toolName: 42 } }, { garbage: true }, undefined];
    expect(() => extractToolCallsFromToolResults(toolResults)).not.toThrow();
    expect(extractToolCallsFromToolResults(toolResults)).toEqual([]);
  });
});

/**
 * #307 C5 (retry/observability): `describeCaseFailure` builds the sanitized
 * `CaseFailureInfo` a real `runCase` throws inside an `EvalCaseError` when
 * `agent.generate()` fails terminally — same cause-chain walk as
 * `apiErrorStatusCode`, plus whatever per-attempt trace the retry policy
 * collected for this case, never a raw provider error object.
 */
describe("describeCaseFailure", () => {
  const attempts: RetryAttemptRecord[] = [
    { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
    { attempt: 2, outcome: "stopped-retries-exhausted", durationMs: 5, statusCode: 503 },
  ];

  it("reads the status code and a controlled classification off a wrapped APICallError — never the raw error name/message", () => {
    const error = new APICallError({
      message: "Service Unavailable",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 503,
    });
    expect(describeCaseFailure(error, attempts)).toEqual({
      statusCode: 503,
      errorName: "TransientProviderError",
      errorMessage: "HTTP 503",
      attempts,
    });
  });

  it("classifies a plain non-API error with no statusCode, and carries the attempts", () => {
    const error = new Error("boom");
    expect(describeCaseFailure(error, [])).toEqual({
      errorName: "UnknownError",
      errorMessage: "Non-provider error",
      attempts: [],
    });
  });

  it("classifies a thrown non-Error value the same way, rather than throwing", () => {
    expect(describeCaseFailure("just a string", [])).toEqual({
      errorName: "UnknownError",
      errorMessage: "Non-provider error",
      attempts: [],
    });
  });

  /**
   * #307 second independent-review correction (2nd round), finding 1: regex
   * redaction of a free-text provider error message is an unsafe half
   * measure — it missed a fake secret with no query-string/header shape and
   * never touched `error.name` at all. The fix is to never let the raw
   * message/name reach the report, redacted or not — only a controlled
   * classification and the numeric status code. Reproduced with the
   * reviewer's own adversarial example (issuecomment-5577124019).
   */
  it("never persists the raw error message or name — only a controlled classification — for the reviewer's adversarial example", () => {
    const error = new Error("token=FAKE_SECRET_FOR_TEST payload: PRIVATE_BODY_EXAMPLE");
    error.name = "PRIVATE_NAME_EXAMPLE";
    const result = describeCaseFailure(error, []);
    expect(JSON.stringify(result)).not.toContain("FAKE_SECRET_FOR_TEST");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_BODY_EXAMPLE");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NAME_EXAMPLE");
    expect(result.errorName).toBe("UnknownError");
    expect(result.errorMessage).toBe("Non-provider error");
  });

  it("classifies a query-string-shaped error message without leaking any of its text", () => {
    const error = new Error(
      "request to https://generativelanguage.googleapis.com/v1?key=FAKE_SECRET_FOR_TEST failed",
    );
    const result = describeCaseFailure(error, []);
    expect(result.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
  });

  it("classifies a bearer-token-shaped error message without leaking any of its text", () => {
    const error = new Error("upstream rejected: Authorization: Bearer FAKE_SECRET_FOR_TEST");
    const result = describeCaseFailure(error, []);
    expect(result.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
  });
});

/**
 * #307 second independent-review correction (2nd round), finding 2: `main()`
 * previously built the retry policy with only a logging `onAttempt` — no
 * shared budget guard checked before every request. `createEvalRetryPolicy`
 * is the extracted, unit-testable wiring `main()` now uses (the same
 * "extract a pure/testable piece out of `main()`" pattern already
 * established by `createCaseAttemptTracker`/`createRunCase` in this file):
 * it builds a retry policy whose `beforeAttempt` consults a real
 * `createBudgetGuard` fed by every attempt's own known usage.
 */
describe("createEvalRetryPolicy", () => {
  function makeTracker(): CaseAttemptTracker & { onAttempt: (r: RetryAttemptRecord) => void } {
    return createCaseAttemptTracker();
  }

  it("lets a request through when known usage is still within budget", async () => {
    const tracker = makeTracker();
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 1_000,
      maxCostUsd: 1,
      attemptTracker: tracker,
    });

    await expect(policy.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  /**
   * Proves the shared-budget behavior end to end at the retry-policy
   * boundary: after a first request's own known usage crosses the token
   * cap, a SECOND request through the SAME policy instance must never reach
   * `operation` at all — the exact "next provider call count remains zero"
   * proof issuecomment-5577124019 asks for, without needing a full
   * tool-calling Mastra Agent (the enforcement point is this shared
   * model-boundary policy, which every one of an Agent's real steps goes
   * through identically).
   */
  it("blocks the next request once a prior request's known usage crosses the token budget — the next provider call count stays at zero", async () => {
    const tracker = makeTracker();
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 100,
      maxCostUsd: 100,
      attemptTracker: tracker,
    });
    const usage = { inputTokens: 60, outputTokens: 50, totalTokens: 110 };

    await policy.run(
      () => Promise.resolve({ text: "step 1" }),
      () => usage,
    );

    const secondOperation = vi.fn().mockResolvedValue({ text: "step 2" });
    await expect(policy.run(secondOperation)).rejects.toThrow(BudgetExceededError);
    expect(secondOperation).not.toHaveBeenCalled();
  });

  it("blocks the next request once a prior request's known usage crosses the cost budget", async () => {
    const tracker = makeTracker();
    const policy = createEvalRetryPolicy({
      modelId: "claude-haiku-4-5", // priced (non-zero) in ./budget.ts's MODEL_PRICING
      maxTotalTokens: 1_000_000,
      maxCostUsd: 0.0001,
      attemptTracker: tracker,
    });
    const usage = { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 };

    await policy.run(
      () => Promise.resolve({ text: "step 1" }),
      () => usage,
    );

    const secondOperation = vi.fn().mockResolvedValue({ text: "step 2" });
    await expect(policy.run(secondOperation)).rejects.toThrow(BudgetExceededError);
    expect(secondOperation).not.toHaveBeenCalled();
  });

  it("shares consumption ACROSS separate createRunCase-style calls (cross-case), not just within one request", async () => {
    const tracker = makeTracker();
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 100,
      maxCostUsd: 100,
      attemptTracker: tracker,
    });
    const usage = { inputTokens: 60, outputTokens: 50, totalTokens: 110 };

    // Case 1's own request.
    await policy.run(
      () => Promise.resolve({ text: "case 1" }),
      () => usage,
    );

    // Case 2's FIRST request must already be blocked — the guard is shared
    // across cases, not reset per case (attemptTracker.reset() only clears
    // the per-case attempt TRACE, never the budget guard).
    tracker.reset();
    const caseTwoOperation = vi.fn().mockResolvedValue({ text: "case 2" });
    await expect(policy.run(caseTwoOperation)).rejects.toThrow(BudgetExceededError);
    expect(caseTwoOperation).not.toHaveBeenCalled();
  });
});

/**
 * #307 second independent-review correction (2nd round), finding 2: `main()`
 * is deliberately outside this file's unit-tested surface (it makes real
 * model calls) — this source-inspection check is the same pattern
 * `runner.test.ts` already uses to pin a specific line of `main()`'s own
 * wiring without executing it: `main()` must build its shared retry policy
 * via `createEvalRetryPolicy` (which IS fully unit-tested above), not an
 * inline `createRetryPolicy` call with no budget guard wired in.
 */
describe("main() wiring (source-inspection, #307 2nd correction finding 2)", () => {
  it("builds its retry policy via createEvalRetryPolicy, not a bare createRetryPolicy call with no budget guard", () => {
    const cliSource = readFileSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), "utf8");
    expect(cliSource).toMatch(/const retryPolicy = createEvalRetryPolicy\(/);
  });
});

describe("createCaseAttemptTracker", () => {
  it("accumulates attempts pushed via onAttempt until reset() clears them", () => {
    const tracker = createCaseAttemptTracker();
    expect(tracker.attempts()).toEqual([]);

    tracker.onAttempt({ attempt: 1, outcome: "success", durationMs: 5 });
    expect(tracker.attempts()).toHaveLength(1);

    tracker.reset();
    expect(tracker.attempts()).toEqual([]);
  });

  /**
   * #307 second independent-review correction (2nd round), finding 3:
   * `attempt` alone restarts at 1 for every logical request (`./retry.ts`'s
   * `run()` call), so a multi-step case's trace can't distinguish "attempt 1
   * of request 2" from "attempt 1 of request 1". `requestIndex` stamps a
   * stable, monotonically increasing request identity: a fresh `attempt: 1`
   * record always starts a NEW request (attempts within one request are
   * strictly sequential — `attempt` only resets when the previous request's
   * `run()` call has already concluded).
   */
  it("stamps a monotonically increasing requestIndex, incrementing only when attempt restarts at 1 (a new request)", () => {
    const tracker = createCaseAttemptTracker();

    tracker.onAttempt({ attempt: 1, outcome: "retrying", durationMs: 5 }); // request 1, attempt 1
    tracker.onAttempt({ attempt: 2, outcome: "success", durationMs: 5 }); // request 1, attempt 2
    tracker.onAttempt({ attempt: 1, outcome: "success", durationMs: 5 }); // request 2, attempt 1

    expect(tracker.attempts().map((a) => [a.requestIndex, a.attempt])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it("resets requestIndex back to a fresh count on reset(), for the next case", () => {
    const tracker = createCaseAttemptTracker();
    tracker.onAttempt({ attempt: 1, outcome: "success", durationMs: 5 });
    tracker.reset();

    tracker.onAttempt({ attempt: 1, outcome: "success", durationMs: 5 });
    expect(tracker.attempts()[0]?.requestIndex).toBe(1);
  });
});

/**
 * #307 C5: `createRunCase` is the pure, unit-testable seam for `main()`'s
 * real `runCase` wiring — a fake `agent.generate` in place of a real
 * `Mastra` `Agent`, so this module's own retry-observability wiring (no
 * nested Mastra retry, terminal failures become `EvalCaseError` carrying
 * the case's own attempt trace) is proven with zero real model calls,
 * matching every other helper in this file.
 */
describe("createRunCase", () => {
  // A fake `agent.generate` in these tests never actually triggers
  // `retryPolicy`'s `onAttempt` (that wiring lives in `main()`, not in
  // `createRunCase` itself), so this tracker double's `attempts()` returns
  // a fixed set regardless of `reset()` — it only records that `reset()`
  // was called at the right point, and that whatever `attempts()` returns
  // at failure time ends up on the thrown `EvalCaseError`.
  function makeTracker(seedAttempts: RetryAttemptRecord[] = []): CaseAttemptTracker {
    return {
      reset: vi.fn(),
      attempts: () => seedAttempts,
    };
  }

  /**
   * #307 second independent-review correction, finding 2: the real Mastra
   * `Agent.generate()` signature has no top-level `maxRetries` option — its
   * OWN nested retry is disabled via `modelSettings: { maxRetries }`
   * (confirmed by wiring a real `Agent` in `retry.test.ts`'s "nested-retry
   * proof" suite, which fails to typecheck against the previous, wrong
   * `{ maxRetries: 0 }` shape). The prior version of this test asserted the
   * WRONG shape and passed only because `GenerateLike` was typed loosely
   * enough to accept it — proving nothing about whether Mastra's real
   * nested retry was actually disabled in production.
   */
  it("calls agent.generate with modelSettings.maxRetries: 0 (Mastra's own nested retry actually disabled) and shapes a successful result", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "He built things [cite:skill:aws].",
      toolResults: [{ payload: { toolName: "search-career", result: { citations: [] } } }],
      totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    const runCase = createRunCase({ generate }, makeTracker());

    const result = await runCase("What has he built?");

    expect(generate).toHaveBeenCalledWith("What has he built?", {
      modelSettings: { maxRetries: 0 },
    });
    expect(result.answer).toBe("He built things [cite:skill:aws].");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("resets the tracker before calling agent.generate, for a fresh per-case attempt trace", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "answer",
      toolResults: [],
      totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const tracker = makeTracker([{ attempt: 1, outcome: "success", durationMs: 1 }]);
    const runCase = createRunCase({ generate }, tracker);

    await runCase("question");

    expect(tracker.reset).toHaveBeenCalledTimes(1);
  });

  it("wraps a terminal agent.generate rejection in an EvalCaseError carrying the tracker's attempts, never regenerating the answer", async () => {
    const providerError = new APICallError({
      message: "Service Unavailable",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 503,
    });
    const generate = vi.fn().mockRejectedValue(providerError);
    const attempts: RetryAttemptRecord[] = [
      { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
      { attempt: 2, outcome: "stopped-retries-exhausted", durationMs: 5, statusCode: 503 },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    await expect(runCase("question")).rejects.toThrow(EvalCaseError);
    // Exactly one call — a terminal failure must never trigger a second,
    // regenerating call from this seam.
    expect(generate).toHaveBeenCalledTimes(1);

    try {
      await runCase("question");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EvalCaseError);
      const caseError = error as EvalCaseError;
      expect(caseError.failure.statusCode).toBe(503);
      expect(caseError.failure.attempts).toEqual(attempts);
    }
  });

  /**
   * #307 second independent-review correction, finding 4: a successful
   * case's own attempt trace was previously discarded — only a FAILED
   * case's attempts reached the report. Persist it on every result so a
   * report consumer can see how many real provider attempts a passing case
   * actually took (retries included), not just failures.
   */
  it("persists the tracker's attempt trace onto a successful result too, not just a failed one", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "answer",
      toolResults: [],
      totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const attempts: RetryAttemptRecord[] = [
      { attempt: 1, outcome: "retrying", durationMs: 5, statusCode: 503 },
      { attempt: 2, outcome: "success", durationMs: 5 },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    const result = await runCase("question");

    expect(result.attempts).toEqual(attempts);
  });

  /**
   * #307 second independent-review correction, finding 4: when
   * `agent.generate`'s result carries no `totalUsage` (or an incomplete
   * one), falling back to a hard-coded `0` fabricates a false "zero tokens
   * spent" — the case DID spend tokens, they're just not reported at this
   * level. Fall back to the tracker's own known per-attempt usage instead,
   * and only when THAT is also unknown, report the zero explicitly flagged
   * via `usageKnown: false` rather than silently.
   */
  it("falls back to the tracker's known usage instead of fabricating a zero when agent.generate reports no totalUsage", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "answer", toolResults: [] });
    const attempts: RetryAttemptRecord[] = [
      {
        attempt: 1,
        outcome: "success",
        durationMs: 5,
        usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
      },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    const result = await runCase("question");

    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
    expect(result.usageKnown).toBe(true);
  });

  /**
   * #307 second independent-review correction (2nd round), finding 1:
   * `EvalCaseError`'s own thrown message previously interpolated the raw
   * caught `error.message` directly — reproduced with the reviewer's
   * adversarial example, this must never happen; the message is built only
   * from `describeCaseFailure`'s already-controlled classification.
   */
  it("never embeds the raw caught error message in the thrown EvalCaseError's own message", async () => {
    const providerError = new Error("token=FAKE_SECRET_FOR_TEST payload: PRIVATE_BODY_EXAMPLE");
    providerError.name = "PRIVATE_NAME_EXAMPLE";
    const generate = vi.fn().mockRejectedValue(providerError);
    const runCase = createRunCase({ generate }, makeTracker());

    try {
      await runCase("question");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EvalCaseError);
      const caseError = error as EvalCaseError;
      expect(caseError.message).not.toContain("FAKE_SECRET_FOR_TEST");
      expect(caseError.message).not.toContain("PRIVATE_BODY_EXAMPLE");
      expect(caseError.message).not.toContain("PRIVATE_NAME_EXAMPLE");
      expect(caseError.failure.errorName).toBe("UnknownError");
    }
  });

  /**
   * #307 second independent-review correction (2nd round), finding 2: a
   * `BudgetExceededError` thrown from `./retry.ts`'s `beforeAttempt` hook
   * (via `agent.generate`) must propagate as-is — distinguishable from an
   * ordinary terminal provider failure — never wrapped in an `EvalCaseError`,
   * so `./runner.ts` can tell "the run's own budget stopped it" apart from
   * "a case's provider call failed."
   */
  it("propagates a BudgetExceededError from agent.generate unchanged, never wrapping it in an EvalCaseError", async () => {
    const budgetError = new BudgetExceededError("Eval token budget exceeded: stopping.");
    const generate = vi.fn().mockRejectedValue(budgetError);
    const runCase = createRunCase({ generate }, makeTracker());

    await expect(runCase("question")).rejects.toBe(budgetError);
  });

  it("marks usageKnown false rather than silently reporting a fabricated zero when neither totalUsage nor any attempt carries known usage", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "answer", toolResults: [] });
    const tracker = makeTracker([{ attempt: 1, outcome: "success", durationMs: 5 }]);
    const runCase = createRunCase({ generate }, tracker);

    const result = await runCase("question");

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(result.usageKnown).toBe(false);
    expect(result.attempts).toEqual([{ attempt: 1, outcome: "success", durationMs: 5 }]);

    // A repeated call re-derives usageKnown from that call's own fresh
    // tracker state, never carrying the prior unknown-usage flag forward.
    const secondResult = await runCase("question");
    expect(secondResult.usageKnown).toBe(false);
    expect(secondResult.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});
