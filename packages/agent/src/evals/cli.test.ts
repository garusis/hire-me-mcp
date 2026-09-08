import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  type CaseAttemptTracker,
  createCaseAttemptTracker,
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

  it("reads the status code and error name/message off a wrapped APICallError", () => {
    const error = new APICallError({
      message: "Service Unavailable",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 503,
    });
    expect(describeCaseFailure(error, attempts)).toEqual({
      statusCode: 503,
      errorName: "AI_APICallError",
      errorMessage: "Service Unavailable",
      attempts,
    });
  });

  it("omits statusCode/errorName for a plain non-API error, but still carries the message and attempts", () => {
    const error = new Error("boom");
    expect(describeCaseFailure(error, [])).toEqual({
      errorName: "Error",
      errorMessage: "boom",
      attempts: [],
    });
  });

  it("stringifies a thrown non-Error value rather than throwing", () => {
    expect(describeCaseFailure("just a string", [])).toEqual({
      errorMessage: "just a string",
      attempts: [],
    });
  });

  /**
   * #307 second independent-review correction, finding 3: a raw provider
   * error message can embed a secret (a `?key=...` query param on the
   * request URL, or an echoed `Authorization`/bearer header) — this must
   * never survive into the case-failure report `describeCaseFailure` builds.
   * Reproduced with a fake token, never a real secret.
   */
  it("redacts a fake secret embedded in the error message rather than leaking it into the report", () => {
    const error = new Error(
      "request to https://generativelanguage.googleapis.com/v1?key=FAKE_SECRET_FOR_TEST failed",
    );
    const result = describeCaseFailure(error, []);
    expect(result.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
    expect(result.errorMessage).toContain("[REDACTED]");
  });

  it("redacts a fake bearer token embedded in the error message", () => {
    const error = new Error("upstream rejected: Authorization: Bearer FAKE_SECRET_FOR_TEST");
    const result = describeCaseFailure(error, []);
    expect(result.errorMessage).not.toContain("FAKE_SECRET_FOR_TEST");
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
