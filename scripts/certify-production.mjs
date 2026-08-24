#!/usr/bin/env node
/**
 * Release-readiness certification run (#76) — executes every level of the
 * test pyramid against the production configuration and reports ONE
 * pass/fail result.
 *
 * Levels, in order (see docs/release-readiness.md for what "green" means
 * at each one):
 *
 *   1. unit               — `pnpm turbo test`, hermetic (Neon/DB env is
 *                           deliberately scrubbed so the runIf-gated
 *                           integration suites can't leak into this step).
 *   2. db-integration     — packages/core integration suites against a
 *                           throwaway Neon branch (never the production
 *                           database — the TRUNCATE-based reset helpers
 *                           only ever touch the disposable branch).
 *   3. e2e-smoke          — root Playwright suite against a locally
 *                           started production build.
 *   4. mcp-protocol       — real @modelcontextprotocol/sdk client against
 *                           a locally started production build.
 *   5. retrieval-eval     — `pnpm eval:retrieval` against the production
 *                           database (read-only ANN queries — same
 *                           safety rationale as agent-evals.yml).
 *   6. agent-evals        — `pnpm eval:agent`, real budget-capped Gemini
 *                           calls with the production model config.
 *   7. production-e2e     — the full preview-gate Playwright suite
 *                           (navigation, content, a11y, SEO, security
 *                           headers, MCP endpoint smoke, chat flows,
 *                           latency budgets) against `BASE_URL` — the
 *                           production site by default.
 *   8. production-lighthouse — the Lighthouse budget gate against
 *                           `BASE_URL`.
 *
 * Safety, by construction: this script never runs `pnpm ingest`, never
 * runs migrations, and never invokes any reset/TRUNCATE helper against
 * `DATABASE_URL` — production data is only ever READ (retrieval/agent
 * evals, search-career MCP calls). Gemini-calling steps run strictly
 * sequentially, sharing the same 15 RPM free-tier budget production chat
 * uses; in CI the workflow additionally sits in the `gemini-free-tier`
 * concurrency group. See docs/release-readiness.md for the analytics /
 * rate-limit / outbound-contact pollution notes.
 *
 * Usage:
 *   pnpm certify:production                # against production
 *   BASE_URL=<origin> pnpm certify:production   # against another deploy
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY, DATABASE_URL, NEON_API_KEY,
 * NEON_PROJECT_ID. Missing env FAILS the run (a release run must not
 * silently skip a level).
 */

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const PRODUCTION_URL = "https://hire-me-mcp-web.vercel.app";
const baseUrl = process.env.BASE_URL ?? PRODUCTION_URL;

const REQUIRED_ENV = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DATABASE_URL",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
];

/** Env without the DB/Neon vars — keeps the `unit` step hermetic. */
function hermeticEnv() {
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "NEON_API_KEY", "NEON_PROJECT_ID"]) {
    delete env[key];
  }
  return env;
}

const STEPS = [
  {
    name: "build-packages",
    command: [
      "pnpm",
      "turbo",
      "run",
      "build",
      "--filter=@hire-me-mcp/core",
      "--filter=@hire-me-mcp/career-data",
      "--filter=@hire-me-mcp/agent",
    ],
    env: () => process.env,
  },
  {
    name: "unit",
    command: ["pnpm", "turbo", "test"],
    env: hermeticEnv,
  },
  {
    name: "db-integration",
    command: [
      "pnpm",
      "--filter",
      "@hire-me-mcp/core",
      "exec",
      "vitest",
      "run",
      "src/db/rag-store.integration.test.ts",
      "src/ingest/run.integration.test.ts",
      "src/search-career.integration.test.ts",
      "src/analytics/analytics.integration.test.ts",
    ],
    env: () => process.env,
  },
  {
    name: "e2e-smoke",
    command: ["pnpm", "test:e2e"],
    env: hermeticEnv,
  },
  {
    name: "mcp-protocol",
    command: ["pnpm", "test:mcp"],
    env: hermeticEnv,
  },
  {
    name: "retrieval-eval",
    command: ["pnpm", "eval:retrieval"],
    env: () => process.env,
  },
  {
    name: "agent-evals",
    command: ["pnpm", "eval:agent"],
    env: () => process.env,
  },
  {
    name: "production-e2e",
    command: ["pnpm", "test:e2e:preview"],
    env: () => ({ ...process.env, BASE_URL: baseUrl }),
  },
  {
    name: "production-lighthouse",
    command: ["pnpm", "run", "lighthouse"],
    env: () => ({ ...process.env, BASE_URL: baseUrl }),
  },
];

function runStep(step) {
  const startedAt = Date.now();
  console.log(`\n=== [certify] ${step.name}: ${step.command.join(" ")}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    stdio: "inherit",
    env: step.env(),
  });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const passed = result.status === 0;
  console.log(
    `=== [certify] ${step.name}: ${passed ? "PASS" : `FAIL (exit ${result.status})`} in ${seconds}s`,
  );
  return { name: step.name, passed, seconds };
}

function writeSummary(results, verdict) {
  const lines = [
    "## Release readiness certification",
    "",
    `Target: ${baseUrl}`,
    "",
    "| Step | Result | Duration |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.name} | ${r.passed ? "PASS" : "FAIL"} | ${r.seconds}s |`),
    "",
    `**Verdict: ${verdict}**`,
  ];
  const table = lines.join("\n");
  console.log(`\n${table}\n`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    appendFileSync(summaryPath, `${table}\n`);
  }
}

function main() {
  const missing = REQUIRED_ENV.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) {
    console.error(
      `certify-production: missing required env: ${missing.join(", ")}. ` +
        "A release run must exercise every level — set them (see .env.example) and re-run.",
    );
    process.exit(1);
  }

  console.log(`[certify] target: ${baseUrl}`);
  const results = [];
  for (const step of STEPS) {
    results.push(runStep(step));
  }

  const failed = results.filter((r) => !r.passed);
  const verdict = failed.length === 0 ? "PASS" : "FAIL";
  writeSummary(results, verdict);
  if (failed.length > 0) {
    console.error(`certify-production: FAIL — ${failed.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
  console.log(
    "certify-production: PASS — every level of the pyramid is green against production configuration.",
  );
}

main();
