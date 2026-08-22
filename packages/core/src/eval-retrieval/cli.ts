/**
 * `pnpm eval:retrieval`'s entry point (#41, epic #6). Wires the pure
 * `./runner.ts` up to the REAL `searchCareer` (#34) — a live Neon +
 * pgvector store (`../db/client.ts`) populated by `pnpm ingest` (#24) and
 * the real Google embedding client (`../embedding/google-client.ts`) — runs
 * the golden dataset (`./dataset/cases.ts`), prints a per-query pass/fail
 * table plus aggregate metrics, writes the machine-readable JSON report to
 * disk, and exits non-zero when the run misses a committed threshold
 * (`./thresholds.ts`).
 *
 * `resolveRetrievalEvalEnvConfig`, `formatCaseTable`, and
 * `runRetrievalEvalCli` are pure/injectable and unit-tested (`cli.test.ts`)
 * with zero database or network calls — `main()` itself (the real DB
 * connection, the real embedding calls, the real filesystem write) is
 * deliberately NOT part of that test suite, matching the
 * `packages/agent/src/evals/cli.ts` pattern this module mirrors. It only
 * runs when this file is executed directly.
 *
 * Locally, `GOOGLE_GENERATIVE_AI_API_KEY` is a known-invalid placeholder
 * (see `README.md`), so a real `pnpm eval:retrieval` run is expected to
 * happen in `.github/workflows/retrieval-eval.yml`'s `workflow_dispatch`
 * job, against a disposable Neon branch — not on a contributor's machine.
 */

import { writeFile as nodeWriteFile } from "node:fs/promises";
import { createDbClient } from "../db/client.js";
import { loadDbConfig, MissingDatabaseUrlError } from "../db/config.js";
import { loadEmbeddingApiKey, MissingEmbeddingApiKeyError } from "../embedding/env.js";
import { createGoogleEmbeddingClient } from "../embedding/google-client.js";
import { createSearchCareer } from "../search-career.js";
import { GOLDEN_QUERIES } from "./dataset/index.js";
import type { GoldenQuery } from "./dataset/schema.js";
import type { RetrievalCaseReport, RetrievalReport } from "./report.js";
import { type RetrievalSearcher, runRetrievalEval } from "./runner.js";
import { RETRIEVAL_THRESHOLDS, type RetrievalThresholds } from "./thresholds.js";

/** Minimal shape this module reads off `process.env`. */
export type CliEnv = Readonly<Record<string, string | undefined>>;

export interface RetrievalEvalEnvConfig {
  /** Results requested per query — also the `k` in recall@k/precision@k. */
  topK: number;
  /** A result at or above this score fails an `absent-topic` query. */
  absentTopicMinScore: number;
  /** Where the JSON report is written — a known, stable path for CI artifact upload. */
  reportPath: string;
}

/** Conservative, documented defaults for an unconfigured run. */
const DEFAULTS: RetrievalEvalEnvConfig = {
  topK: 5,
  absentTopicMinScore: 0.4,
  reportPath: "retrieval-eval-report.json",
};

function readPositiveNumber(env: CliEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Resolve the retrieval eval's env-configurable knobs, falling back to conservative defaults for anything unset or malformed. */
export function resolveRetrievalEvalEnvConfig(env: CliEnv = process.env): RetrievalEvalEnvConfig {
  return {
    topK: readPositiveNumber(env, "EVAL_RETRIEVAL_TOP_K", DEFAULTS.topK),
    absentTopicMinScore: readPositiveNumber(
      env,
      "EVAL_RETRIEVAL_ABSENT_MIN_SCORE",
      DEFAULTS.absentTopicMinScore,
    ),
    reportPath: env.EVAL_RETRIEVAL_REPORT_PATH?.trim() || DEFAULTS.reportPath,
  };
}

function formatCaseLine(caseReport: RetrievalCaseReport): string {
  const status = caseReport.passed ? "PASS" : "FAIL";
  const metricsPart =
    caseReport.metrics !== null
      ? `recall=${caseReport.metrics.recallAtK.toFixed(2)} precision=${caseReport.metrics.precisionAtK.toFixed(2)} rr=${caseReport.metrics.reciprocalRank.toFixed(2)}`
      : `expectEmpty=${caseReport.expectEmptyCheck?.passed ?? "?"}`;
  return `[${status}] ${caseReport.id} (${caseReport.category}) — ${metricsPart}`;
}

/** Render a human-readable per-query pass/fail table for console output. */
export function formatCaseTable(report: RetrievalReport): string {
  return report.cases.map(formatCaseLine).join("\n");
}

/** Injected dependencies — the real-call and real-I/O seam. See module docs. */
export interface RunCliDeps {
  searchCareer: RetrievalSearcher["searchCareer"];
  writeFile: (path: string, contents: string) => Promise<void>;
  log: (message: string) => void;
}

export interface RunCliConfig {
  queries: readonly GoldenQuery[];
  envConfig: RetrievalEvalEnvConfig;
  thresholds?: RetrievalThresholds;
}

/**
 * Runs the retrieval eval against the given (real or fake) `searchCareer`,
 * prints the per-query table and aggregates, writes the JSON report, and
 * returns the process exit code (`0` on a passing verdict, `1` otherwise)
 * — never calls `process.exit` itself, so tests can assert both paths on
 * injected fakes without touching a real process.
 */
export async function runRetrievalEvalCli(config: RunCliConfig, deps: RunCliDeps): Promise<number> {
  const thresholds = config.thresholds ?? RETRIEVAL_THRESHOLDS;

  deps.log(
    `Running retrieval eval: ${config.queries.length} golden quer${config.queries.length === 1 ? "y" : "ies"}, ` +
      `topK=${config.envConfig.topK}, absentTopicMinScore=${config.envConfig.absentTopicMinScore}.`,
  );

  const report = await runRetrievalEval(
    {
      queries: config.queries,
      topK: config.envConfig.topK,
      absentTopicMinScore: config.envConfig.absentTopicMinScore,
      thresholds,
    },
    { searchCareer: deps.searchCareer },
  );

  deps.log(formatCaseTable(report));
  deps.log(
    `Aggregates — recall@${config.envConfig.topK}: ${report.aggregates.recallAtK.toFixed(4)}, ` +
      `precision@${config.envConfig.topK}: ${report.aggregates.precisionAtK.toFixed(4)}, ` +
      `MRR: ${report.aggregates.mrr.toFixed(4)}, ` +
      `absent-topic accuracy: ${report.aggregates.absentTopicAccuracy.toFixed(4)}.`,
  );

  await deps.writeFile(config.envConfig.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  deps.log(`Report written to ${config.envConfig.reportPath}`);

  if (!report.verdict.passed) {
    deps.log("Retrieval eval FAILED threshold checks:");
    for (const failure of report.verdict.failures) {
      deps.log(`  - ${failure}`);
    }
    return 1;
  }

  deps.log("Retrieval eval passed every threshold.");
  return 0;
}

async function main(): Promise<void> {
  const envConfig = resolveRetrievalEvalEnvConfig();
  const dbConfig = loadDbConfig();
  const apiKey = loadEmbeddingApiKey();

  const client = createDbClient(dbConfig);
  try {
    const searchCareer = createSearchCareer({
      sql: client.sql,
      embedder: createGoogleEmbeddingClient({ apiKey, taskType: "RETRIEVAL_QUERY" }),
    });

    const exitCode = await runRetrievalEvalCli(
      { queries: GOLDEN_QUERIES, envConfig },
      {
        searchCareer,
        writeFile: (path, contents) => nodeWriteFile(path, contents, "utf8"),
        log: (message) => console.log(message),
      },
    );
    process.exitCode = exitCode;
  } finally {
    await client.close();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main().catch((error: unknown) => {
    if (error instanceof MissingDatabaseUrlError || error instanceof MissingEmbeddingApiKeyError) {
      console.error(error.message);
    } else {
      console.error("Retrieval eval run failed:", error);
    }
    process.exitCode = 1;
  });
}
