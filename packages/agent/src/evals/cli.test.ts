import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getInterviewAgent } from "../index.js";
import { BudgetExceededError } from "./budget.js";
import {
  buildObservabilityLog,
  type CaseAttemptTracker,
  createCaseAttemptTracker,
  createEvalRetryPolicy,
  createObservabilityCollector,
  createRunCase,
  describeCaseFailure,
  extractCitationsFromToolResults,
  extractToolCallsFromToolResults,
  extractToolNamesFromToolResults,
  filterCasesByIds,
  persistEvalArtifacts,
  printReportSummary,
  resolveRunnerEnvConfig,
  summarizeReportForCli,
} from "./cli.js";
import type { EvalCase } from "./dataset/schema.js";
import {
  createRateLimitedModel,
  createRequestRateLimiter,
  DEFAULT_EVAL_RPM_LIMIT,
  FREE_TIER_RPM_CEILING,
  type RequestObservabilityRecord,
} from "./rate-limit.js";
import { buildReport, type CaseReport, type ObservabilityLogMeta } from "./report.js";
import { createRetryingModel, type RetryAttemptRecord } from "./retry.js";
import { EvalCaseError, runEvalSuite } from "./runner.js";

describe("resolveRunnerEnvConfig", () => {
  it("falls back to conservative defaults when env is empty", () => {
    const config = resolveRunnerEnvConfig({});
    expect(config.maxCases).toBeGreaterThan(0);
    expect(config.maxTotalTokens).toBeGreaterThan(0);
    expect(config.maxCostUsd).toBeGreaterThan(0);
    expect(config.rpmLimit).toBeGreaterThan(0);
    expect(config.reportPath.length).toBeGreaterThan(0);
    expect(config.observabilityPath.length).toBeGreaterThan(0);
    expect(config.caseIds).toBeUndefined();
  });

  it("reads every override from env", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_MAX_CASES: "3",
      EVAL_MAX_TOTAL_TOKENS: "1000",
      EVAL_MAX_COST_USD: "0.02",
      EVAL_RPM_LIMIT: "5",
      EVAL_REPORT_PATH: "custom-report.json",
      EVAL_OBSERVABILITY_PATH: "custom-observability.json",
      EVAL_CASE_IDS: "grounded-nodejs-experience,gap-golang",
    });
    expect(config).toEqual({
      maxCases: 3,
      maxTotalTokens: 1000,
      maxCostUsd: 0.02,
      rpmLimit: 5,
      reportPath: "custom-report.json",
      observabilityPath: "custom-observability.json",
      caseIds: ["grounded-nodejs-experience", "gap-golang"],
    });
  });

  it("defaults observabilityPath to a documented, gitignored sibling of the report path (#307 options 1+2)", () => {
    expect(resolveRunnerEnvConfig({}).observabilityPath).toBe("eval-observability.json");
  });

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3's
   * tail: the test above claimed "gitignored" but only ever asserted the
   * filename string — the root `.gitignore` never actually listed it, so
   * `git status` would show `packages/agent/eval-observability.json` as an
   * untracked file after every real run, unlike `eval-report.json`
   * (`.gitignore` line "packages/agent/eval-report.json"). This proves the
   * claim directly against the real file instead.
   */
  it("is actually listed in the repo's root .gitignore — not just claimed by a test title", () => {
    const gitignore = readFileSync(
      fileURLToPath(new URL("../../../../.gitignore", import.meta.url)),
      "utf8",
    );
    expect(gitignore).toMatch(/^packages\/agent\/eval-observability\.json$/m);
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

function record(overrides: Partial<RequestObservabilityRecord> = {}): RequestObservabilityRecord {
  return {
    requestId: 0,
    admittedAt: "2026-01-01T00:00:00.000Z",
    sendAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.050Z",
    waitMs: 0,
    windowCount: 1,
    effectiveRpm: 1,
    outcome: "success",
    ...overrides,
  };
}

const observabilityMeta = {
  runId: "run-1",
  modelId: "gemini-3.6-flash",
  configuredRpmLimit: 10,
  configuredWindowMs: 60_000,
};

describe("buildObservabilityLog (#307 options 1+2 / #307 Codex review, finding 4)", () => {
  it("wraps the limiter's own request records with run/model identity, configured knobs, a generatedAt timestamp and count", () => {
    const requests = [
      { ...record({ requestId: 0 }), caseId: "case-a", caseRequestSequence: 1 },
      {
        ...record({ requestId: 1, outcome: "error" as const }),
        caseId: "case-a",
        caseRequestSequence: 2,
      },
    ];
    const log = buildObservabilityLog(
      requests,
      observabilityMeta,
      () => "2026-01-01T00:00:01.000Z",
    );

    expect(log).toEqual({
      ...observabilityMeta,
      generatedAt: "2026-01-01T00:00:01.000Z",
      requestCount: 2,
      requests,
    });
  });

  it("produces a durable, safe-to-persist shape for zero requests (a run stopped before any admission)", () => {
    const log = buildObservabilityLog([], observabilityMeta, () => "2026-01-01T00:00:01.000Z");
    expect(log).toEqual({
      ...observabilityMeta,
      generatedAt: "2026-01-01T00:00:01.000Z",
      requestCount: 0,
      requests: [],
    });
  });

  it("never persists a raw error body/header — every record is already the limiter's own sanitized shape", () => {
    const withQuota = {
      ...record({
        requestId: 2,
        outcome: "error" as const,
        statusCode: 429,
        quotaClassification: "daily" as const,
        retryHintMs: 9_000,
      }),
      caseId: "case-a",
      caseRequestSequence: 1,
    };
    const log = buildObservabilityLog(
      [withQuota],
      observabilityMeta,
      () => "2026-01-01T00:00:01.000Z",
    );
    const serialized = JSON.stringify(log);
    expect(serialized).toContain('"quotaClassification":"daily"');
    expect(serialized).toContain('"retryHintMs":9000');
    expect(serialized).not.toMatch(/GOOGLE_GENERATIVE_AI_API_KEY|Bearer |x-goog-api-key/i);
  });
});

describe("createObservabilityCollector (#307 options 1+2 / #307 Codex review, finding 4)", () => {
  it("collects onRequest records in order and wraps them via buildObservabilityLog on log(), stamping every record with a null case correlation before startCase is ever called", () => {
    const collector = createObservabilityCollector();
    const first = record({ requestId: 0 });
    const second = record({ requestId: 1, outcome: "error", statusCode: 502 });

    collector.onRequest(first);
    collector.onRequest(second);
    const log = collector.log(observabilityMeta, () => "2026-01-01T00:00:02.000Z");

    expect(log).toEqual({
      ...observabilityMeta,
      generatedAt: "2026-01-01T00:00:02.000Z",
      requestCount: 2,
      requests: [
        { ...first, caseId: null, caseRequestSequence: null },
        { ...second, caseId: null, caseRequestSequence: null },
      ],
    });
  });

  it("logs an empty request list when main() never wires onRequest, or the run admits nothing", () => {
    const collector = createObservabilityCollector();
    expect(collector.log(observabilityMeta, () => "2026-01-01T00:00:02.000Z")).toEqual({
      ...observabilityMeta,
      generatedAt: "2026-01-01T00:00:02.000Z",
      requestCount: 0,
      requests: [],
    });
  });

  it("stamps every subsequent request with the case id set via startCase, and a per-case 1-based sequence (#307 Codex review, finding 4)", () => {
    const collector = createObservabilityCollector();

    collector.startCase("case-a");
    collector.onRequest(record({ requestId: 0 }));
    collector.onRequest(record({ requestId: 1 }));
    collector.startCase("case-b");
    collector.onRequest(record({ requestId: 2 }));

    const log = collector.log(observabilityMeta, () => "2026-01-01T00:00:02.000Z");
    expect(log.requests.map((r) => [r.caseId, r.caseRequestSequence])).toEqual([
      ["case-a", 1],
      ["case-a", 2],
      ["case-b", 1],
    ]);
  });

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3:
   * the previous `caseRequestSequence` was a completion-callback count —
   * incremented inside `onRequest` itself, after `operation()` already
   * settled — never explicitly tied to `./retry.ts`'s own `requestIndex`/
   * `attempt` tracking. `beginRequest` lets `main()` stamp the EXACT
   * identity `./cli.ts`'s `createCaseAttemptTracker.beginAttempt` already
   * computed for this same attempt, captured BEFORE `operation()` runs, so
   * the persisted record is explicitly joinable to the retry trace rather
   * than merely happening to march in lockstep with it.
   */
  it("stamps caseRequestSequence/attempt from the explicit beginRequest identity, not the auto-incrementing fallback, when beginRequest was called", () => {
    const collector = createObservabilityCollector();

    collector.startCase("case-a");
    collector.beginRequest(1, 1);
    collector.onRequest(record({ requestId: 0 }));
    collector.beginRequest(1, 2); // same logical request, retried once
    collector.onRequest(record({ requestId: 1, outcome: "error", statusCode: 429 }));
    collector.beginRequest(2, 1); // next logical request
    collector.onRequest(record({ requestId: 2 }));

    const log = collector.log(observabilityMeta, () => "2026-01-01T00:00:02.000Z");
    expect(log.requests.map((r) => [r.caseRequestSequence, r.attempt])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it("consumes each beginRequest identity exactly once — a request admitted without its own beginRequest call falls back to the auto-incrementing sequence and carries no attempt field", () => {
    const collector = createObservabilityCollector();

    collector.startCase("case-a");
    collector.beginRequest(5, 1);
    collector.onRequest(record({ requestId: 0 }));
    collector.onRequest(record({ requestId: 1 })); // no matching beginRequest call

    const log = collector.log(observabilityMeta, () => "2026-01-01T00:00:02.000Z");
    expect(log.requests[0]?.caseRequestSequence).toBe(5);
    expect(log.requests[0]?.attempt).toBe(1);
    expect(log.requests[1]?.caseRequestSequence).toBe(2);
    expect(log.requests[1]).not.toHaveProperty("attempt");
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
  function makeTracker(): CaseAttemptTracker & {
    onAttempt: (r: RetryAttemptRecord) => void;
    beginAttempt: (attempt: number) => number;
  } {
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

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3:
   * `onBeforeAttempt` fires with the tracker's own `requestIndex`/`attempt`
   * BEFORE `operation` runs — `main()` wires this to the observability
   * collector's `beginRequest` so the limiter's record for this exact
   * attempt is explicitly, not coincidentally, correlated to the same
   * identity `./retry.ts`'s attempt trace carries.
   */
  it("calls onBeforeAttempt with the requestIndex/attempt about to run, before operation, for a fresh request and a second one after it", async () => {
    const tracker = makeTracker();
    const seen: Array<[number, number]> = [];
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 1_000,
      maxCostUsd: 1,
      attemptTracker: tracker,
      onBeforeAttempt: (requestIndex, attempt) => seen.push([requestIndex, attempt]),
    });

    await expect(policy.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
    tracker.reset();
    await expect(policy.run(() => Promise.resolve("ok"))).resolves.toBe("ok");

    expect(seen).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it("never calls onBeforeAttempt once the shared budget already blocks the request", async () => {
    const tracker = makeTracker();
    const onBeforeAttempt = vi.fn();
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 100,
      maxCostUsd: 100,
      attemptTracker: tracker,
      onBeforeAttempt,
    });
    const usage = { inputTokens: 60, outputTokens: 50, totalTokens: 110 };
    await policy.run(
      () => Promise.resolve({ text: "step 1" }),
      () => usage,
    );
    onBeforeAttempt.mockClear();

    await expect(policy.run(() => Promise.resolve({ text: "step 2" }))).rejects.toThrow(
      BudgetExceededError,
    );
    expect(onBeforeAttempt).not.toHaveBeenCalled();
  });

  /**
   * #307 fourth independent Codex review (issuecomment-5620836057), finding
   * 3: the composed-wiring suite below needs a deterministic, zero-real-wait
   * way to prove a `stopped-deadline-exceeded` stop through the SAME
   * `createEvalRetryPolicy` wiring `main()` uses — not a bare
   * `createRetryPolicy` call reimplementing that wiring. `now`/`sleep`/
   * `maxRequestMs`/`maxPhaseMs` are passed straight through to the
   * underlying `./retry.ts` policy so a test can drive a virtual clock
   * instead of real timers.
   */
  it("passes now/sleep/maxRequestMs/maxPhaseMs straight through to the underlying retry policy — a retried 429's own 15s hint is driven entirely by the injected virtual clock, never a real 15s wait (#307 fourth independent Codex review, issuecomment-5620836057, finding 3)", async () => {
    const tracker = makeTracker();
    let currentTime = 0;
    const now = () => currentTime;
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
      currentTime += ms;
    };
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 1_000_000,
      maxCostUsd: 1_000,
      attemptTracker: tracker,
      now,
      sleep,
      maxRequestMs: 60_000,
    });

    const minuteQuota429 = new APICallError({
      message: "Too Many Requests",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      responseHeaders: { "retry-after": "15" },
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
            },
          ],
        },
      }),
    });

    let calls = 0;
    const result = await policy.run(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(minuteQuota429) : Promise.resolve("recovered");
    });

    expect(result).toBe("recovered");
    // The retry actually waited through the INJECTED sleep (real
    // setTimeout-based default sleep never records anything here, and
    // would blow past this test's default 5s timeout waiting 15 real
    // seconds instead).
    expect(sleepCalls).toEqual([15_000]);
    expect(currentTime).toBe(15_000);
  }, 4_000);

  it("passes maxRequestMs through so a hint past the injected virtual deadline stops deterministically, with zero real sleeps", async () => {
    const tracker = makeTracker();
    let currentTime = 0;
    const now = () => currentTime;
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
      currentTime += ms;
    };
    const policy = createEvalRetryPolicy({
      modelId: "gemini-3.6-flash",
      maxTotalTokens: 1_000_000,
      maxCostUsd: 1_000,
      attemptTracker: tracker,
      now,
      sleep,
      maxRequestMs: 5_000,
    });

    const minuteQuota429WithFarHint = new APICallError({
      message: "Too Many Requests",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      // 9_999s — far past the 5s virtual request deadline configured above.
      responseHeaders: { "retry-after": "9999" },
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
            },
          ],
        },
      }),
    });

    await expect(policy.run(() => Promise.reject(minuteQuota429WithFarHint))).rejects.toThrow(
      minuteQuota429WithFarHint,
    );
    expect(sleepCalls).toEqual([]);
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

  it("wires the limiter's onRequest into an observability collector and persists its log via persistEvalArtifacts (#307 options 1+2 / third independent Codex review, finding 3)", () => {
    const cliSource = readFileSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), "utf8");
    expect(cliSource).toMatch(/const observability = createObservabilityCollector\(\)/);
    expect(cliSource).toMatch(/onRequest:\s*observability\.onRequest/);
    // Must pass the ACTUAL configured path into the real write helper, not
    // merely mention it in a comment.
    expect(cliSource).toMatch(/observabilityPath:\s*envConfig\.observabilityPath/);
    expect(cliSource).toMatch(/observability\.log\(/);
  });

  it("folds the observability log into the durable eval-report.json artifact, not only the separate untracked file (#307 Codex review, finding 4 — neither agent-evals.yml nor release-readiness.yml retains eval-observability.json)", () => {
    const cliSource = readFileSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), "utf8");
    expect(cliSource).toMatch(/observability:\s*observability\.log\(/);
    expect(cliSource).toMatch(/observability\.startCase\(/);
  });

  it("never claims a 429 stops immediately, unconditionally — the actual policy retries an unambiguous per-minute quota with a trustworthy hint (#307 Codex review, finding 4)", () => {
    const cliSource = readFileSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), "utf8");
    expect(cliSource).not.toMatch(/429 stops immediately/);
  });

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3's
   * tail: the standalone `eval-observability.json` sidecar is a DUPLICATE
   * of the same data already embedded in `report.observability` below it.
   * Both writes previously lived in the SAME `finally` block with no
   * try/catch — a sidecar write failure (disk full, permission error) would
   * throw out of `finally`, skipping every statement after it, including
   * the durable `eval-report.json` write. The sidecar write must be
   * fault-tolerant so it can never block the report it duplicates.
   *
   * Third independent Codex review (issuecomment-5620134895), finding 3:
   * this fault-tolerance logic now lives in the dedicated, exported
   * `persistEvalArtifacts` function (proven directly, with real behavior —
   * not source-regex alone — by the "composed offline wiring" suite below)
   * rather than inline in `main()`. This test now proves the structural half
   * of that same contract that a purely behavioral test cannot: `main()`
   * itself actually calls `persistEvalArtifacts` (never reverts to
   * reimplementing the two writes inline), and `persistEvalArtifacts`'s own
   * source still wraps the sidecar write in a try/catch positioned BEFORE
   * the report write.
   */
  it("delegates to persistEvalArtifacts, which wraps the observability sidecar write in a try/catch that cannot prevent the report write below it from running", () => {
    const cliSource = readFileSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), "utf8");
    expect(cliSource).toMatch(/await persistEvalArtifacts\(/);

    const fnStart = cliSource.indexOf("export async function persistEvalArtifacts(");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = cliSource.slice(fnStart);
    const sidecarWriteIndex = fnBody.indexOf("params.observabilityPath,");
    const reportWriteIndex = fnBody.indexOf("params.reportPath,");
    expect(sidecarWriteIndex).toBeGreaterThan(-1);
    expect(reportWriteIndex).toBeGreaterThan(sidecarWriteIndex);
    const between = fnBody.slice(sidecarWriteIndex, reportWriteIndex);
    expect(between).toMatch(/catch/);
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

  /**
   * Second independent Codex review (issuecomment-5608823305), finding 3:
   * `beginAttempt` computes the SAME requestIndex `onAttempt` would derive,
   * but BEFORE `operation()` runs — called from `./retry.ts`'s
   * `beforeAttempt(attempt)` hook — so a caller (`./cli.ts`'s `main()`) can
   * hand that identity to the limiter's own observability collector ahead
   * of the real provider send, rather than only being able to compute it
   * after the fact from `onAttempt`.
   */
  it("beginAttempt returns the requestIndex an attempt WILL get, matching what onAttempt records for it afterward", () => {
    const tracker = createCaseAttemptTracker();

    expect(tracker.beginAttempt(1)).toBe(1); // request 1, attempt 1
    tracker.onAttempt({ attempt: 1, outcome: "retrying", durationMs: 5 });
    expect(tracker.beginAttempt(2)).toBe(1); // request 1, attempt 2 (retry)
    tracker.onAttempt({ attempt: 2, outcome: "success", durationMs: 5 });
    expect(tracker.beginAttempt(1)).toBe(2); // request 2, attempt 1
    tracker.onAttempt({ attempt: 1, outcome: "success", durationMs: 5 });

    expect(tracker.attempts().map((a) => a.requestIndex)).toEqual([1, 1, 2]);
  });

  it("beginAttempt's requestIndex survives even when onAttempt is never called for that attempt (e.g. a deadline stop before the outer loop's own onAttempt fires)", () => {
    const tracker = createCaseAttemptTracker();
    expect(tracker.beginAttempt(1)).toBe(1);
    expect(tracker.beginAttempt(1)).toBe(2); // a fresh request 2, no request 1 onAttempt ever recorded
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

  it("invokes options.onCaseStart with the question BEFORE calling agent.generate, so observability can correlate this case's requests (#307 Codex review, finding 4)", async () => {
    const callOrder: string[] = [];
    const generate = vi.fn().mockImplementation(async () => {
      callOrder.push("generate");
      return {
        text: "answer",
        toolResults: [],
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });
    const onCaseStart = vi.fn().mockImplementation(() => callOrder.push("onCaseStart"));
    const runCase = createRunCase({ generate }, makeTracker(), { onCaseStart });

    await runCase("What has he built?");

    expect(onCaseStart).toHaveBeenCalledWith("What has he built?");
    expect(callOrder).toEqual(["onCaseStart", "generate"]);
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

  /**
   * #307 review issuecomment-5577656024, finding 1: a mid-case
   * `BudgetExceededError` (thrown from `./retry.ts`'s `beforeAttempt` hook
   * before a request that would cross the shared budget) previously
   * propagated with NO attempts trace attached, so `./runner.ts` had no way
   * to recover this case's own known usage collected before the stop — a
   * successful first request's known 150 tokens were silently lost from the
   * report's totals. `createRunCase` must attach the tracker's own attempts
   * (collected for THIS case, via the shared `onAttempt` wiring) onto the
   * error before rethrowing, same as `describeCaseFailure` already does for
   * an `EvalCaseError`.
   */
  it("attaches the tracker's known attempt trace onto a rethrown BudgetExceededError, so mid-case known usage is never lost", async () => {
    const budgetError = new BudgetExceededError("Eval token budget exceeded: stopping.");
    const generate = vi.fn().mockRejectedValue(budgetError);
    const attempts: RetryAttemptRecord[] = [
      {
        attempt: 1,
        outcome: "success",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
      { attempt: 1, outcome: "stopped-budget-exceeded", durationMs: 0 },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    try {
      await runCase("question");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceededError);
      expect((error as BudgetExceededError).attempts).toEqual(attempts);
    }
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

  /**
   * #307 review issuecomment-5577656024, finding 2: a successful case whose
   * `agent.generate()` result carries no `totalUsage` and whose own attempt
   * trace is a MIX of known and unknown usage (e.g. a retried request whose
   * first attempt succeeded with known usage and a later attempt's usage
   * genuinely can't be read) previously discarded the known partial sum
   * entirely — `sumKnownUsage(...).complete` was `false` so the fallback was
   * dropped and the case reported an all-zero `usage` with `usageKnown:
   * false`, even though 150 tokens of that case's own consumption WAS known.
   * The fix preserves that known partial sum in `usage` while keeping
   * `usageKnown: false` to keep the incompleteness explicit — never
   * presenting the partial sum as the complete total.
   */
  it("preserves a known PARTIAL usage sum (not zero) when some attempts carry known usage and others don't, while keeping usageKnown false", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "answer", toolResults: [] });
    const attempts: RetryAttemptRecord[] = [
      {
        attempt: 1,
        outcome: "success",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
      { attempt: 1, outcome: "success", durationMs: 5, usage: "unknown" },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    const result = await runCase("question");

    // The known 150 tokens are preserved, never zeroed out just because a
    // later attempt's usage was unknowable.
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    // But usageKnown stays false — this is a partial sum, not a certified
    // complete total (never presented as if it accounted for every attempt).
    expect(result.usageKnown).toBe(false);
  });

  /**
   * #307 review issuecomment-5577656024, finding 2 (2nd part): "ensure
   * reported totalUsage does not incorrectly certify complete provider usage
   * when retry attempts have unknown consumption." A real Mastra `Agent` can
   * return a fully-numeric, well-formed `result.totalUsage` that SILENTLY
   * dropped a step whose own usage was unreadable (proven against the real
   * `@mastra/core` `Agent` in `runner.test.ts`'s durable-verification suite)
   * — trusting that reported total as "complete" just because it parses
   * would wrongly certify a partial sum as the whole picture. Whenever this
   * case's own attempt trace shows incomplete usage, the reported total must
   * be treated the same as the attempts-based fallback: usable as the known
   * partial sum, but never `usageKnown: true`.
   */
  it("never trusts a well-formed reported totalUsage as complete when this case's own attempt trace shows incomplete usage", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "answer",
      toolResults: [],
      // A fully-numeric, parseable totalUsage — the shape `reportedUsageOf`
      // accepts outright today.
      totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const attempts: RetryAttemptRecord[] = [
      {
        attempt: 1,
        outcome: "success",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
      // A 2nd attempt whose own usage genuinely can't be read — the trace
      // this case's tracker actually collected is INCOMPLETE, even though
      // `totalUsage` above looks like a clean, complete number.
      { attempt: 1, outcome: "success", durationMs: 5, usage: "unknown" },
    ];
    const tracker = makeTracker(attempts);
    const runCase = createRunCase({ generate }, tracker);

    const result = await runCase("question");

    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(result.usageKnown).toBe(false);
  });
});

/**
 * #307 issuecomment-5591843129 assignment B / diagnosis 5591743584 (c):
 * `main()`'s report-summary console output previously (1) labeled EVERY
 * incomplete run "STOPPED early after a terminal provider failure", even a
 * budget stop that never failed a provider call, and (2) buried the budget
 * message inside "FAILED threshold checks", so a run that ALSO had genuine
 * scorer failures (e.g. a real assertion/completeness miss) read as if the
 * only problem was the budget — the genuine failures were still technically
 * printed (folded into the same list) but never distinguished from the
 * execution-stop reason. `summarizeReportForCli` is the pure, testable piece
 * `main()` now defers to for this labeling, split out for exactly the
 * "main() itself is not unit-tested, its pure helpers are" reason this
 * module's other exports already follow (see this file's other suites).
 */
describe("summarizeReportForCli", () => {
  const totals = { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0 };

  const groundedCase: CaseReport = {
    id: "grounded-1",
    category: "grounded",
    question: "What has he built with AWS?",
    answer: "He built things with AWS [cite:skill:aws].",
    scores: {
      groundedness: { score: 1, reason: "fully cited" },
      gapHonesty: { score: 1, reason: "n/a for this case" },
      relevance: { score: 0.95, reason: "addresses AWS" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    },
  };

  const weakRelevanceCase: CaseReport = {
    ...groundedCase,
    id: "weak-relevance-1",
    scores: { ...groundedCase.scores, relevance: { score: 0.1, reason: "off target" } },
  };

  it("reports a passing, complete run with no execution or threshold failure lines", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [groundedCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.5 },
    });

    const summary = summarizeReportForCli(report);

    expect(summary.passed).toBe(true);
    expect(summary.executionFailureLines).toEqual([]);
    expect(summary.thresholdFailureLines).toEqual([]);
  });

  it("reports a genuine scorer threshold miss as a threshold failure line, with no execution failure line, on an otherwise-complete run", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [weakRelevanceCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.9 },
    });

    const summary = summarizeReportForCli(report);

    expect(summary.passed).toBe(false);
    expect(summary.executionFailureLines).toEqual([]);
    expect(summary.thresholdFailureLines.some((line) => /relevance/i.test(line))).toBe(true);
  });

  it("labels a budget stop distinctly from a terminal provider failure, and keeps the budget message out of the threshold-failure lines", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [groundedCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.5 },
      unexecutedCaseIds: ["never-ran-1"],
      budgetExceeded: {
        message:
          "Eval token budget exceeded: 1000 total token(s) used, max is 500. Aborting rather than spending further.",
      },
    });

    const summary = summarizeReportForCli(report);

    expect(summary.passed).toBe(false);
    expect(summary.executionFailureLines.some((line) => /budget/i.test(line))).toBe(true);
    expect(
      summary.executionFailureLines.some((line) => /terminal provider failure/i.test(line)),
    ).toBe(false);
    expect(summary.executionFailureLines.some((line) => line.includes("never-ran-1"))).toBe(true);
    expect(summary.thresholdFailureLines.some((line) => /budget/i.test(line))).toBe(false);
  });

  it("labels a terminal provider failure distinctly from a budget stop", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [groundedCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.5 },
      failedCases: [
        {
          id: "failed-1",
          category: "grounded",
          question: "q",
          errorMessage: "quota exceeded",
          attempts: [],
        },
      ],
      unexecutedCaseIds: ["never-ran-2"],
    });

    const summary = summarizeReportForCli(report);

    expect(summary.passed).toBe(false);
    expect(
      summary.executionFailureLines.some((line) => /terminal provider failure/i.test(line)),
    ).toBe(true);
    expect(summary.executionFailureLines.some((line) => /budget/i.test(line))).toBe(false);
    expect(summary.executionFailureLines.some((line) => line.includes("never-ran-2"))).toBe(true);
  });

  /**
   * The core diagnosed defect: a run can be stopped on budget AND still have
   * genuine, real threshold failures (assertion/completeness misses) among
   * the cases that DID complete — the summary must never suppress or
   * misrepresent those as "no threshold failures" just because the run also
   * stopped on budget.
   */
  it("represents simultaneous causes correctly: a budget stop AND a genuine threshold failure both surface, distinctly", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [weakRelevanceCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.9 },
      budgetExceeded: {
        message:
          "Eval token budget exceeded: 1000 total token(s) used, max is 500. Aborting rather than spending further.",
      },
    });

    const summary = summarizeReportForCli(report);

    expect(summary.passed).toBe(false);
    expect(summary.executionFailureLines.some((line) => /budget/i.test(line))).toBe(true);
    expect(summary.thresholdFailureLines.some((line) => /relevance/i.test(line))).toBe(true);
    expect(summary.thresholdFailureLines.some((line) => /budget/i.test(line))).toBe(false);
  });
});

/**
 * #307 issuecomment-5591843129 assignment B / diagnosis 5591743584 (c):
 * `printReportSummary` is `main()`'s own console-output glue around
 * {@link summarizeReportForCli} — kept as its own injectable-io function
 * (the same dependency-injection seam `createRunCase`/`runEvalSuite`
 * already use in this package) specifically so `main()`'s printing and
 * exit-status decision is unit-testable without a real model call, even
 * though `main()` itself stays untested per this module's docs.
 */
describe("printReportSummary", () => {
  const totals = { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0 };
  const groundedCase: CaseReport = {
    id: "grounded-1",
    category: "grounded",
    question: "What has he built with AWS?",
    answer: "He built things with AWS [cite:skill:aws].",
    scores: {
      groundedness: { score: 1, reason: "fully cited" },
      gapHonesty: { score: 1, reason: "n/a for this case" },
      relevance: { score: 0.95, reason: "addresses AWS" },
      toolRouting: null,
      answerAssertions: null,
      storyCompleteness: null,
      preferredSourceCompliance: null,
      factualBoundaryCompliance: null,
    },
  };

  it("returns true and logs a passing message when the report is complete and every threshold cleared", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [groundedCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.5 },
    });
    const log = vi.fn();
    const error = vi.fn();

    const passed = printReportSummary(report, { log, error });

    expect(passed).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/passed every threshold/i));
  });

  it("returns false and logs the budget-stop line via error, never the generic terminal-provider-failure label, when only the budget stopped the run", () => {
    const report = buildReport({
      promptVersion: "test-version",
      modelId: "gemini-3.6-flash",
      cases: [groundedCase],
      totals,
      thresholds: { groundedness: 0.5, gapHonesty: 0.5, relevance: 0.5 },
      budgetExceeded: {
        message:
          "Eval token budget exceeded: 1000 total token(s) used, max is 500. Aborting rather than spending further.",
      },
    });
    const log = vi.fn();
    const error = vi.fn();

    const passed = printReportSummary(report, { log, error });

    expect(passed).toBe(false);
    const errorLines = error.mock.calls.map((call) => String(call[0]));
    expect(errorLines.some((line) => /budget/i.test(line))).toBe(true);
    expect(errorLines.some((line) => /terminal provider failure/i.test(line))).toBe(false);
    expect(errorLines.some((line) => /FAILED threshold checks/i.test(line))).toBe(false);
  });
});

/**
 * #307 third independent Codex review (issuecomment-5620134895), finding 3:
 * the review flagged that the only existing "sidecar write failure" test was
 * a source-regex assertion (`cli.ts` contains a `catch` between the two
 * writes), and that the case/logical-request/attempt correlation
 * (`./report.ts`'s `CorrelatedObservabilityRecord`, `ObservabilityCollector`)
 * was only ever proven by hand-calling the collector/tracker separately from
 * their own unit tests — never through the REAL composed wiring `main()`
 * builds (limiter -> observability collector -> attempt tracker -> retry
 * policy -> retrying model -> a real Mastra `Agent` -> `createRunCase` ->
 * `runEvalSuite` -> `buildReport`). This suite composes those exact pieces
 * against a fake `MockLanguageModelV4` — zero real network calls, zero real
 * timers — proves the join in the FINAL SERIALIZED report/observability log,
 * and separately proves a sidecar write failure cannot prevent the durable
 * report from persisting, through the real `persistEvalArtifacts` helper
 * `main()` itself calls (not a reimplementation of its logic in the test).
 *
 * "Zero real timers" above was inaccurate before the fifth independent Codex
 * review (issuecomment-5621313572): `createRequestRateLimiter` was built
 * with no `now`/`sleep` of its own, so its ~600ms-per-admission spacing wait
 * (`windowMs / rpmLimit`) still ran on the real `Date.now`/`setTimeout`
 * default for every request after the first in `runComposedSuite` below —
 * only the retry policy's wait was virtual. `runComposedSuite` now shares
 * one injected virtual clock between `createEvalRetryPolicy` AND
 * `createRequestRateLimiter`, so the claim is actually true end to end.
 */
describe("composed offline wiring — case/logical-request/attempt correlation end to end (#307 third independent Codex review, finding 3)", () => {
  function generateResult(text: string) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    };
  }

  /** A real per-minute-quota 429 with a trustworthy but near-instant hint, so the composed suite retries without a real wait. */
  function minuteQuota429(): APICallError {
    return new APICallError({
      message: "Too Many Requests",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      responseHeaders: { "retry-after": "0" },
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
            },
          ],
        },
      }),
    });
  }

  async function runComposedSuite() {
    // Call #1 -> case-a's only request (success). Call #2 -> case-b's first
    // attempt (429, retried). Call #3 -> case-b's second attempt (success).
    let calls = 0;
    const doGenerate = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw minuteQuota429();
      return generateResult(`answer ${calls}`);
    });
    const inner = new MockLanguageModelV4({ doGenerate: doGenerate as never });

    // One virtual clock shared by the retry policy's own wait AND the
    // limiter's admission-spacing wait (#307 fifth independent Codex review,
    // issuecomment-5621313572: the limiter previously fell back to real
    // `Date.now`/`setTimeout`, adding ~600ms of real pacing per admission
    // after the first). `retrySleepCalls`/`limiterSleepCalls` are tracked
    // separately so a retry wait is never confused with an admission wait —
    // together they prove every wait in this suite went through an injected
    // seam, never a real timer.
    let currentTime = 0;
    const now = () => currentTime;
    const retrySleepCalls: number[] = [];
    const retrySleep = async (ms: number) => {
      retrySleepCalls.push(ms);
      currentTime += ms;
    };
    const limiterSleepCalls: number[] = [];
    const limiterSleep = async (ms: number) => {
      limiterSleepCalls.push(ms);
      currentTime += ms;
    };

    // The exact composition `./cli.ts`'s `main()` builds — see its own
    // module docs — assembled here directly from the same exported pieces,
    // never hand-calling the collector/tracker in isolation from a fake
    // record shape.
    const observability = createObservabilityCollector();
    const limiter = createRequestRateLimiter({
      rpmLimit: 100,
      maxRetries: 0,
      onRequest: observability.onRequest,
      now,
      sleep: limiterSleep,
    });
    const attemptTracker = createCaseAttemptTracker();
    const retryPolicy = createEvalRetryPolicy({
      modelId: "gemini-3.5-flash-lite",
      maxTotalTokens: 1_000_000,
      maxCostUsd: 1_000,
      attemptTracker,
      onBeforeAttempt: (requestIndex, attempt) => observability.beginRequest(requestIndex, attempt),
      now,
      sleep: retrySleep,
    });
    const model = createRetryingModel({
      model: createRateLimitedModel({ model: inner, limiter }),
      retryPolicy,
    });
    const agent = getInterviewAgent({ model });

    const cases: EvalCase[] = [
      {
        id: "case-a",
        category: "grounded",
        question: "Question A",
        gapHonestyDirection: "claimed",
      },
      {
        id: "case-b",
        category: "grounded",
        question: "Question B",
        gapHonestyDirection: "claimed",
      },
    ];

    const report = await runEvalSuite(
      {
        cases,
        budget: { maxCases: cases.length, maxTotalTokens: 1_000_000, maxCostUsd: 1_000 },
        promptVersion: "test-version",
        modelId: "gemini-3.5-flash-lite",
      },
      {
        runCase: createRunCase(agent, attemptTracker, {
          onCaseStart: (question) => {
            const caseId = cases.find((c) => c.question === question)?.id ?? question;
            observability.startCase(caseId);
          },
        }),
      },
    );

    const meta: ObservabilityLogMeta = {
      runId: "test-run",
      modelId: "gemini-3.5-flash-lite",
      configuredRpmLimit: 100,
      configuredWindowMs: 60_000,
    };
    const observabilityLog = observability.log(meta);
    const fullReport = { ...report, observability: observabilityLog };
    return { fullReport, observabilityLog, retrySleepCalls, limiterSleepCalls };
  }

  it("joins case/logical-request/attempt identity between the retry policy's own per-case attempt trace and the limiter's observability log, in the final serialized report", async () => {
    const { fullReport, observabilityLog, retrySleepCalls, limiterSleepCalls } =
      await runComposedSuite();

    // Every wait this run performed went through an injected clock, never a
    // real timer: the retry policy's single 429 recovery waited its 0ms
    // hint, and the limiter's own admission-spacing wait (100 rpm over a
    // 60s window is 600ms between successive admissions) fired for both
    // requests after the first — this deterministically fails (rather than
    // merely running slow) if a future change drops `now`/`sleep` from
    // either `createEvalRetryPolicy` or `createRequestRateLimiter`, since a
    // dropped option falls back to the real, un-tracked default and these
    // arrays would stay empty instead of recording the expected waits.
    expect(retrySleepCalls).toEqual([0]);
    expect(limiterSleepCalls).toEqual([600, 600]);

    // The run completed both cases with no terminal failure — the retried
    // 429 recovered, so this is a normal, passing execution shape.
    expect(fullReport.failedCases).toEqual([]);
    expect(fullReport.cases.map((c) => c.id)).toEqual(["case-a", "case-b"]);

    const caseA = fullReport.cases.find((c) => c.id === "case-a");
    const caseB = fullReport.cases.find((c) => c.id === "case-b");
    expect(caseA?.attempts).toHaveLength(1);
    expect(caseB?.attempts).toHaveLength(2);
    expect(caseB?.attempts?.[0]?.outcome).toBe("retrying");
    expect(caseB?.attempts?.[0]?.quotaClassification).toBe("per-minute");
    expect(caseB?.attempts?.[1]?.outcome).toBe("success");

    // Three real admitted requests total: 1 for case-a, 2 for case-b (the
    // 429 attempt and its retry) — proves every request, including the
    // retry, took its own limiter slot and was observed.
    expect(observabilityLog.requestCount).toBe(3);
    const caseARequests = observabilityLog.requests.filter((r) => r.caseId === "case-a");
    const caseBRequests = observabilityLog.requests.filter((r) => r.caseId === "case-b");
    expect(caseARequests).toHaveLength(1);
    expect(caseBRequests).toHaveLength(2);

    // The explicit join: `./cli.ts`'s `ObservabilityCollector.beginRequest`
    // stamps each observability record's `caseRequestSequence` with the SAME
    // `requestIndex` the attempt tracker computed for that exact attempt,
    // and `attempt` with the same 1-based attempt number — not merely
    // matching completion order.
    for (const record of caseBRequests) {
      const matchingAttempt = caseB?.attempts?.find((a) => a.attempt === record.attempt);
      expect(matchingAttempt).toBeDefined();
      expect(record.caseRequestSequence).toBe(matchingAttempt?.requestIndex);
    }
    // Both of case-b's requests belong to the SAME logical request (the
    // retry re-acquired a slot but never started a new logical request).
    expect(new Set(caseBRequests.map((r) => r.caseRequestSequence)).size).toBe(1);
    expect(caseBRequests.map((r) => r.attempt).sort()).toEqual([1, 2]);
    // The 429 attempt is recorded as an "error" outcome; the retry that
    // recovered is "success" — the observability log's own outcome field
    // must agree with the attempt trace's outcome for the same attempt.
    const firstAttemptRecord = caseBRequests.find((r) => r.attempt === 1);
    const secondAttemptRecord = caseBRequests.find((r) => r.attempt === 2);
    expect(firstAttemptRecord?.outcome).toBe("error");
    expect(firstAttemptRecord?.quotaClassification).toBe("per-minute");
    expect(secondAttemptRecord?.outcome).toBe("success");
    // Belt-and-braces on top of the sleep-array checks above: the real
    // admission spacing this suite would need without the injected clock is
    // 1200ms (two 600ms waits); a tight per-test timeout well under that
    // fails the test outright if a future change reintroduces a real wait,
    // rather than merely running slower.
  }, 500);

  it("persists the durable report through the real persistEvalArtifacts wiring even when the observability sidecar write fails — never hand-simulated", async () => {
    const { fullReport, observabilityLog } = await runComposedSuite();
    const writeFile = vi.fn(async (path: string, _data: string) => {
      if (path === "eval-observability.json") {
        throw new Error("ENOSPC: no space left on device");
      }
    });
    const log = vi.fn();
    const error = vi.fn();

    await persistEvalArtifacts({
      report: fullReport,
      observabilityLog,
      reportPath: "eval-report.json",
      observabilityPath: "eval-observability.json",
      writeFile,
      io: { log, error },
    });

    // The sidecar write was attempted and failed, logged as non-fatal...
    expect(writeFile).toHaveBeenCalledWith(
      "eval-observability.json",
      expect.stringContaining('"requestCount": 3'),
    );
    expect(error.mock.calls.some((call) => /sidecar/i.test(String(call[0])))).toBe(true);
    // ...but the durable report write still happened, with the SAME
    // correlated data embedded in it.
    const reportCall = writeFile.mock.calls.find(([path]) => path === "eval-report.json");
    expect(reportCall).toBeDefined();
    const persistedReport = JSON.parse(String(reportCall?.[1]));
    expect(persistedReport.observability.requestCount).toBe(3);
    expect(persistedReport.cases.map((c: { id: string }) => c.id)).toEqual(["case-a", "case-b"]);

    // #307 fourth independent Codex review, issuecomment-5620836057, finding
    // 3: the prior version of this test only checked `requestCount` and case
    // ids — never that the PERSISTED sidecar JSON actually carries the same
    // requestIndex/attempt correlation tuples the in-memory report asserted
    // above. Parse the sidecar payload (attempted even though its own write
    // failed — `writeFile` was still called with its serialized body) and
    // verify every case-b observability record's `caseRequestSequence`/
    // `attempt` tuple still matches its corresponding attempt-trace entry
    // after a real JSON round trip, not merely by object identity in memory.
    const sidecarCall = writeFile.mock.calls.find(([path]) => path === "eval-observability.json");
    expect(sidecarCall).toBeDefined();
    const persistedSidecar = JSON.parse(String(sidecarCall?.[1]));
    const persistedCaseB = persistedReport.cases.find((c: { id: string }) => c.id === "case-b");
    const persistedCaseBRequests = persistedSidecar.requests.filter(
      (r: { caseId: string }) => r.caseId === "case-b",
    );
    expect(persistedCaseBRequests).toHaveLength(2);
    for (const record of persistedCaseBRequests) {
      const matchingAttempt = persistedCaseB.attempts.find(
        (a: { attempt: number }) => a.attempt === record.attempt,
      );
      expect(matchingAttempt).toBeDefined();
      expect(record.caseRequestSequence).toBe(matchingAttempt.requestIndex);
    }
    expect(
      persistedCaseBRequests.map((r: { caseRequestSequence: number; attempt: number }) => [
        r.caseRequestSequence,
        r.attempt,
      ]),
    ).toEqual([
      [1, 1],
      [1, 2],
    ]);
  }, 500);
});

/**
 * #307 fourth independent Codex review (issuecomment-5620836057), finding 3:
 * the composed suite above gives every case exactly ONE logical request
 * (`case-b` retries once then succeeds, but never issues a SECOND logical
 * request within the same case), and never exercises a deadline stop —
 * both explicitly requested as remaining integration coverage. This suite
 * extends the same real production composition (limiter -> observability
 * collector -> attempt tracker -> retry policy -> retrying model -> a real
 * Mastra `Agent` -> `createRunCase` -> `runEvalSuite` -> `buildReport`) with:
 * a case whose first logical request retries then succeeds via a TOOL CALL,
 * forcing the real Agent to issue a genuine second logical request
 * (`requestIndex` 2) for the same case; and a separate case whose only
 * request's 429 hint blows an injected, deliberately tiny virtual deadline,
 * proving `stopped-deadline-exceeded` deterministically via
 * `createEvalRetryPolicy`'s `now`/`sleep`/`maxRequestMs` test seam (this
 * file's `createEvalRetryPolicy` describe block above) rather than the
 * limiter's/retry policy's real wall clock — so this suite provably never
 * waits 90 real seconds for the deadline case, no `vi.useFakeTimers()`
 * needed.
 *
 * Fifth independent Codex review (issuecomment-5621313572): the previous
 * version of this suite injected `now`/`sleep` into `createEvalRetryPolicy`
 * only — `createRequestRateLimiter` still defaulted to real
 * `Date.now`/`setTimeout`, so the five real provider calls below still cost
 * ~2400ms of real admission-spacing pacing (100 rpm over a 60s window is
 * 600ms between successive admissions), contradicting the "clock is injected
 * end to end" and "zero real sleeps" claims. `runMultiStepAndDeadlineSuite`
 * now shares the SAME virtual clock between the retry policy and the
 * limiter, so both waits are injected and the claim is actually true.
 */
describe("composed offline wiring — multi-step logical requests and a deadline stop (#307 fourth independent Codex review, finding 3)", () => {
  function generateResult(text: string) {
    return {
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    };
  }

  function toolCallResult() {
    return {
      content: [
        { type: "tool-call" as const, toolCallId: "call-1", toolName: "fake-tool", input: "{}" },
      ],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage: {
        inputTokens: { total: 8, noCache: 8, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 4, text: 4, reasoning: undefined },
      },
      warnings: [],
    };
  }

  /** A real per-minute-quota 429 with a trustworthy, near-instant hint (retried via the injected virtual clock, not a real wait). */
  function minuteQuota429(retryAfterSeconds = "0"): APICallError {
    return new APICallError({
      message: "Too Many Requests",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      responseHeaders: { "retry-after": retryAfterSeconds },
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
            },
          ],
        },
      }),
    });
  }

  /**
   * A minute-quota 429 whose hint (600s) deliberately exceeds
   * `DEADLINE_CASE_MAX_REQUEST_MS` below, so the retry policy stops rather
   * than retries — proven via the injected virtual clock, never a real wait.
   */
  function minuteQuota429FarHint(): APICallError {
    return minuteQuota429("600");
  }

  const DEADLINE_CASE_MAX_REQUEST_MS = 5_000;

  function fakeTool() {
    return createTool({
      id: "fake-tool",
      description: "test tool",
      inputSchema: z.object({}).strict(),
      execute: async () => ({ ok: true }),
    });
  }

  async function runMultiStepAndDeadlineSuite() {
    // One virtual clock shared by the retry policy's own wait AND the
    // limiter's admission-spacing wait. `retrySleepCalls`/`limiterSleepCalls`
    // are tracked separately — a retry wait and an admission wait are
    // distinct events and must never be asserted as one merged, ambiguous
    // list — but both mutate the SAME `currentTime`, so the two waits stay
    // correctly interleaved in one coherent timeline, proving every wait in
    // this suite went through an injected seam, never a real setTimeout.
    let currentTime = 0;
    const now = () => currentTime;
    const retrySleepCalls: number[] = [];
    const retrySleep = async (ms: number) => {
      retrySleepCalls.push(ms);
      currentTime += ms;
    };
    const limiterSleepCalls: number[] = [];
    const limiterSleep = async (ms: number) => {
      limiterSleepCalls.push(ms);
      currentTime += ms;
    };

    // Call #1 -> case-a's only request (success, one step).
    // Call #2 -> case-b's request #1, attempt #1 (429, retried).
    // Call #3 -> case-b's request #1, attempt #2 (tool call — this logical
    //   request SUCCEEDS with a tool call, so the real Agent issues a
    //   genuine second logical request for the same case).
    // Call #4 -> case-b's request #2, attempt #1 (final text answer).
    // Call #5 -> case-c's only request, only attempt (429 whose 600s hint
    //   blows the tiny virtual deadline below — stops, never retried).
    let calls = 0;
    const doGenerate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return generateResult("answer 1");
      if (calls === 2) throw minuteQuota429();
      if (calls === 3) return toolCallResult();
      if (calls === 4) return generateResult("final answer");
      if (calls === 5) throw minuteQuota429FarHint();
      throw new Error(`unexpected extra provider call #${calls}`);
    });
    const inner = new MockLanguageModelV4({ doGenerate: doGenerate as never });

    const observability = createObservabilityCollector();
    const limiter = createRequestRateLimiter({
      rpmLimit: 100,
      maxRetries: 0,
      onRequest: observability.onRequest,
      now,
      sleep: limiterSleep,
    });
    const attemptTracker = createCaseAttemptTracker();
    const retryPolicy = createEvalRetryPolicy({
      modelId: "gemini-3.5-flash-lite",
      maxTotalTokens: 1_000_000,
      maxCostUsd: 1_000,
      attemptTracker,
      onBeforeAttempt: (requestIndex, attempt) => observability.beginRequest(requestIndex, attempt),
      now,
      sleep: retrySleep,
      maxRequestMs: DEADLINE_CASE_MAX_REQUEST_MS,
    });
    const model = createRetryingModel({
      model: createRateLimitedModel({ model: inner, limiter }),
      retryPolicy,
    });
    const agent = new Agent({
      id: "test-agent",
      name: "Test Agent",
      instructions: "test",
      model,
      tools: { "fake-tool": fakeTool() },
    });

    const cases: EvalCase[] = [
      {
        id: "case-a",
        category: "grounded",
        question: "Question A",
        gapHonestyDirection: "claimed",
      },
      {
        id: "case-b",
        category: "grounded",
        question: "Question B",
        gapHonestyDirection: "claimed",
      },
      {
        id: "case-c",
        category: "grounded",
        question: "Question C",
        gapHonestyDirection: "claimed",
      },
    ];

    const report = await runEvalSuite(
      {
        cases,
        budget: { maxCases: cases.length, maxTotalTokens: 1_000_000, maxCostUsd: 1_000 },
        promptVersion: "test-version",
        modelId: "gemini-3.5-flash-lite",
      },
      {
        runCase: createRunCase(agent, attemptTracker, {
          onCaseStart: (question) => {
            const caseId = cases.find((c) => c.question === question)?.id ?? question;
            observability.startCase(caseId);
          },
        }),
      },
    );

    const meta: ObservabilityLogMeta = {
      runId: "test-run",
      modelId: "gemini-3.5-flash-lite",
      configuredRpmLimit: 100,
      configuredWindowMs: 60_000,
    };
    const observabilityLog = observability.log(meta);
    const fullReport = { ...report, observability: observabilityLog };
    return {
      fullReport,
      observabilityLog,
      retrySleepCalls,
      limiterSleepCalls,
      calls: () => calls,
    };
  }

  it("exercises a real SECOND logical request (requestIndex 2) within one case via a genuine tool-call step, and stops a separate case on a deliberately unreachable 429 deadline — all through the injected virtual clock (retry policy AND limiter admission pacing), with zero real sleeps", async () => {
    const { fullReport, observabilityLog, retrySleepCalls, limiterSleepCalls, calls } =
      await runMultiStepAndDeadlineSuite();

    // Exactly 5 real provider calls total, proving no extra/duplicate
    // dispatch and no real retry of the deadline-blown case-c request.
    expect(calls()).toBe(5);
    // Every wait this run performed went through an injected clock, never a
    // real timer. The retry policy waited its one 0ms hint (the 600s
    // deadline-blowing hint on case-c was never actually slept on — it
    // stops instead). The limiter's own admission-spacing wait (100 rpm
    // over a 60s window is 600ms between successive admissions) fired for
    // each of the 4 admissions after the first, across all 3 cases. Kept as
    // two separate arrays, never merged, so a retry wait is never mistaken
    // for an admission wait: this deterministically fails (rather than
    // merely running slow, ~2400ms of real pacing) if a future change drops
    // `now`/`sleep` from either `createEvalRetryPolicy` or
    // `createRequestRateLimiter`, since a dropped option falls back to the
    // real, un-tracked default and the corresponding array would stay empty.
    expect(retrySleepCalls).toEqual([0]);
    expect(limiterSleepCalls).toEqual([600, 600, 600, 600]);

    expect(fullReport.cases.map((c) => c.id)).toEqual(["case-a", "case-b"]);
    expect(fullReport.failedCases.map((c) => c.id)).toEqual(["case-c"]);

    const caseB = fullReport.cases.find((c) => c.id === "case-b");
    // Two logical requests: request #1 (429 then success-via-tool-call,
    // two attempts) and request #2 (the final answer, one attempt) — three
    // attempts total for the case.
    expect(caseB?.attempts).toHaveLength(3);
    const requestIndexes = caseB?.attempts?.map((a) => a.requestIndex);
    expect(requestIndexes).toEqual([1, 1, 2]);
    expect(caseB?.attempts?.map((a) => a.outcome)).toEqual(["retrying", "success", "success"]);

    // The deadline-blown case-c request: a single attempt, stopped rather
    // than retried against a hint that would never fit inside the
    // (injected, 5s) virtual request deadline.
    const caseCFailure = fullReport.failedCases.find((c) => c.id === "case-c");
    expect(caseCFailure?.attempts).toHaveLength(1);
    expect(caseCFailure?.attempts?.[0]?.outcome).toBe("stopped-deadline-exceeded");
    expect(caseCFailure?.attempts?.[0]?.quotaClassification).toBe("per-minute");
    expect(caseCFailure?.attempts?.[0]?.retryHintMs).toBe(600_000);

    // Five real admitted requests total across all three cases — every
    // attempt (including the one that never retried) took its own
    // limiter slot.
    expect(observabilityLog.requestCount).toBe(5);
    const caseBRequests = observabilityLog.requests.filter((r) => r.caseId === "case-b");
    expect(caseBRequests).toHaveLength(3);
    // The explicit join, across BOTH of case-b's logical requests: every
    // observability record's `caseRequestSequence`/`attempt` tuple matches
    // its corresponding attempt-trace entry's `requestIndex`/`attempt`.
    // Matching by `attempt` alone would be ambiguous here — both logical
    // requests number their own attempts starting at 1 — so the join key
    // is the (requestIndex, attempt) pair.
    for (const record of caseBRequests) {
      const matchingAttempt = caseB?.attempts?.find(
        (a) => a.requestIndex === record.caseRequestSequence && a.attempt === record.attempt,
      );
      expect(matchingAttempt).toBeDefined();
      expect(record.caseRequestSequence).toBe(matchingAttempt?.requestIndex);
    }
    expect(
      caseBRequests
        .map((r) => [r.caseRequestSequence ?? 0, r.attempt ?? 0] as const)
        .sort(([a0, a1], [b0, b1]) => a0 - b0 || a1 - b1),
    ).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);

    const caseCRequests = observabilityLog.requests.filter((r) => r.caseId === "case-c");
    expect(caseCRequests).toHaveLength(1);
    expect(caseCRequests[0]?.caseRequestSequence).toBe(1);
    expect(caseCRequests[0]?.attempt).toBe(1);
    expect(caseCRequests[0]?.outcome).toBe("error");
    expect(caseCRequests[0]?.quotaClassification).toBe("per-minute");

    // Proves the whole joined shape survives a real JSON round trip, the
    // same serialization `./cli.ts`'s `main()` performs before persisting.
    const persisted = JSON.parse(JSON.stringify(fullReport));
    const persistedCaseB = persisted.cases.find((c: { id: string }) => c.id === "case-b");
    expect(persistedCaseB.attempts.map((a: { requestIndex: number }) => a.requestIndex)).toEqual([
      1, 1, 2,
    ]);
    const persistedCaseCFailure = persisted.failedCases.find(
      (c: { id: string }) => c.id === "case-c",
    );
    expect(persistedCaseCFailure.attempts[0].outcome).toBe("stopped-deadline-exceeded");
    expect(persisted.observability.requestCount).toBe(5);
    // Belt-and-braces on top of the sleep-array checks above: the real
    // admission spacing this suite would need without the injected limiter
    // clock is ~2400ms (four 600ms waits); a tight per-test timeout well
    // under that fails the test outright if a future change reintroduces a
    // real wait, rather than merely running slower inside the old 4000ms
    // budget.
  }, 1_000);
});
