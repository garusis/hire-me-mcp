/**
 * The eval suite's single documented entry point (#72):
 *
 *   pnpm --filter @hire-me-mcp/agent eval:agent
 *
 * Wires the pure `./runner.ts` up to the REAL interview agent
 * (`getInterviewAgent()`, real Gemini calls via the local `.env` key — see
 * `packages/agent/README.md`'s provider table), runs the curated dataset
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
import { EVAL_CASES } from "./dataset/index.js";
import type { EvalCase } from "./dataset/schema.js";
import { runEvalSuite } from "./runner.js";
import type { ReturnedCitation } from "./scorers/types.js";
import { EVAL_THRESHOLDS } from "./thresholds.js";

/** Minimal shape this module reads off `process.env` — mirrors the pattern `apps/web/lib/chat/agent-limits.ts` uses. */
export type RunnerEnv = Readonly<Record<string, string | undefined>>;

export interface RunnerEnvConfig {
  maxCases: number;
  maxTotalTokens: number;
  maxCostUsd: number;
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
  rpmLimit: 10,
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

async function main(): Promise<void> {
  const envConfig = resolveRunnerEnvConfig();
  const modelId = resolveChatModelConfig().modelId;
  const cases = filterCasesByIds(EVAL_CASES, envConfig.caseIds);

  console.log(
    `Running eval suite: up to ${envConfig.maxCases} case(s)` +
      (envConfig.caseIds ? ` (filtered to: ${envConfig.caseIds.join(", ")})` : "") +
      `, max ${envConfig.maxTotalTokens} tokens / $${envConfig.maxCostUsd} budget, ` +
      `${envConfig.rpmLimit} RPM throttle, model ${modelId}.`,
  );

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
      rpmLimit: envConfig.rpmLimit,
    },
    {
      runCase: async (question) => {
        const agent = getInterviewAgent();
        const result = await agent.generate(question);
        return {
          answer: result.text,
          toolCitations: extractCitationsFromToolResults(result.toolResults ?? []),
          usage: {
            inputTokens: result.totalUsage?.inputTokens ?? 0,
            outputTokens: result.totalUsage?.outputTokens ?? 0,
            totalTokens: result.totalUsage?.totalTokens ?? 0,
          },
        };
      },
    },
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
