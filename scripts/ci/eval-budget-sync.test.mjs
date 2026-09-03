#!/usr/bin/env node
/**
 * #295 integration correction (independent review, finding 2): a durable
 * repository-level regression that reads the REAL workflow YAML — not a
 * hand-mirrored constant inside a package test — and proves both full-suite
 * CI routes (the normal `agent-evals.yml` PR/push route, and the
 * `release-readiness.yml` certification route) cap the eval suite at least
 * as large as the dataset actually is, with compatible token/cost budgets
 * between the two. This is what stops either workflow's cap from silently
 * regressing (e.g. back to 25) while every other test stays green — the
 * prior fix only hard-coded `CI_DEFAULT_MAX_CASES = 66` inside
 * `packages/agent/src/evals/dataset/story-manifest-cases.test.ts` without
 * ever reading either workflow file, so a YAML regression alone couldn't
 * turn that test red.
 *
 * The dataset-side exact 66/38 assertions stay in that package test
 * unchanged (`EVAL_CASES.length === 66`, `STORY_MANIFEST_CASES.length ===
 * 38`) — this file does not duplicate or replace them.
 *
 * `DATASET_SIZE` below is the one number this file still hard-codes: it
 * runs under plain `node --test` (see `ci:scripts:test` in package.json),
 * which cannot import the TS dataset module without a build step, so it
 * cannot re-derive the real dataset length itself. Keep it in sync BY HAND
 * with `story-manifest-cases.test.ts`'s own `EVAL_CASES.length` assertion
 * if the dataset ever grows — the durable part of this guard is that it
 * reads the workflows for real, not that it re-counts the dataset.
 *
 * Run: `pnpm ci:scripts:test` (also matched by the `ci:scripts:test`
 * glob directly).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATASET_SIZE = 66; // keep in sync with story-manifest-cases.test.ts

const AGENT_EVALS_PATH = ".github/workflows/agent-evals.yml";
const RELEASE_READINESS_PATH = ".github/workflows/release-readiness.yml";

function readWorkflow(relativePath) {
  return readFileSync(`${REPO_ROOT}/${relativePath}`, "utf8");
}

/**
 * Deliberately naive line-based extraction, not a full YAML parser (this
 * repo has no `yaml` dependency) — good enough for the flat,
 * single-occurrence-per-file `KEY: <value>` env lines both workflows
 * actually use. Handles two shapes seen in the real files:
 *
 *   EVAL_MAX_TOTAL_TOKENS: "690000"                         (quoted literal)
 *   EVAL_MAX_CASES: ${{ github.event.inputs.max_cases || '66' }}  (GH
 *     expression with a single-quoted fallback — the value the normal
 *     PR/push route actually uses, since `github.event.inputs.max_cases`
 *     is only set for `workflow_dispatch`)
 *
 * Throws if the key isn't found or neither shape matches, so a workflow
 * edit that changes this shape fails this test loud instead of silently
 * mis-parsing into a false pass.
 */
function extractEnvNumber(yamlText, key) {
  const line = yamlText.split("\n").find((candidate) => candidate.trim().startsWith(`${key}:`));
  if (line === undefined) {
    throw new Error(`${key} not found as an env line in workflow YAML`);
  }
  const quoted = line.match(/:\s*"([^"]+)"/);
  if (quoted) return Number(quoted[1]);
  const fallbackExpression = line.match(/\|\|\s*'([^']+)'/);
  if (fallbackExpression) return Number(fallbackExpression[1]);
  throw new Error(`${key} line didn't match a quoted literal or a GH-expression fallback: ${line}`);
}

function extractJobTimeoutMinutes(yamlText) {
  const match = yamlText.match(/^\s*timeout-minutes:\s*(\d+)\s*$/m);
  if (!match) {
    throw new Error("timeout-minutes not found in workflow YAML");
  }
  return Number(match[1]);
}

test("agent-evals.yml's default EVAL_MAX_CASES covers the full dataset", () => {
  const yamlText = readWorkflow(AGENT_EVALS_PATH);
  const maxCases = extractEnvNumber(yamlText, "EVAL_MAX_CASES");
  assert.ok(
    maxCases >= DATASET_SIZE,
    `agent-evals.yml's EVAL_MAX_CASES default (${maxCases}) must be >= the ${DATASET_SIZE}-case dataset`,
  );
});

test("release-readiness.yml's EVAL_MAX_CASES covers the full dataset", () => {
  const yamlText = readWorkflow(RELEASE_READINESS_PATH);
  const maxCases = extractEnvNumber(yamlText, "EVAL_MAX_CASES");
  assert.ok(
    maxCases >= DATASET_SIZE,
    `release-readiness.yml's EVAL_MAX_CASES (${maxCases}) must be >= the ${DATASET_SIZE}-case dataset — ` +
      "a certification run must not silently skip most of the dataset it claims to certify",
  );
});

test("release-readiness.yml's token/cost budgets are at least as large as agent-evals.yml's", () => {
  const agentEvalsText = readWorkflow(AGENT_EVALS_PATH);
  const releaseReadinessText = readWorkflow(RELEASE_READINESS_PATH);

  const agentEvalsTokens = extractEnvNumber(agentEvalsText, "EVAL_MAX_TOTAL_TOKENS");
  const agentEvalsCost = extractEnvNumber(agentEvalsText, "EVAL_MAX_COST_USD");
  const releaseReadinessTokens = extractEnvNumber(releaseReadinessText, "EVAL_MAX_TOTAL_TOKENS");
  const releaseReadinessCost = extractEnvNumber(releaseReadinessText, "EVAL_MAX_COST_USD");

  assert.ok(
    releaseReadinessTokens >= agentEvalsTokens,
    `release-readiness.yml's EVAL_MAX_TOTAL_TOKENS (${releaseReadinessTokens}) must be >= ` +
      `agent-evals.yml's (${agentEvalsTokens}) — both certify the same full dataset`,
  );
  assert.ok(
    releaseReadinessCost >= agentEvalsCost,
    `release-readiness.yml's EVAL_MAX_COST_USD (${releaseReadinessCost}) must be >= ` +
      `agent-evals.yml's (${agentEvalsCost}) — both certify the same full dataset`,
  );
});

test("release-readiness.yml's job timeout budgets more time than agent-evals.yml's alone", () => {
  const agentEvalsText = readWorkflow(AGENT_EVALS_PATH);
  const releaseReadinessText = readWorkflow(RELEASE_READINESS_PATH);

  const agentEvalsTimeout = extractJobTimeoutMinutes(agentEvalsText);
  const releaseReadinessTimeout = extractJobTimeoutMinutes(releaseReadinessText);

  // release-readiness's single job runs the ENTIRE pyramid — unit,
  // db-integration, e2e-smoke, mcp-protocol, retrieval-eval, agent-evals
  // (the same full 66-case run agent-evals.yml budgets 60 minutes for on
  // its own), production-scripted-chat-refused, production-e2e,
  // production-chat-live, and production-lighthouse — plus its own
  // up-front Gemini slot wait. Its timeout must strictly exceed
  // agent-evals.yml's own job timeout, or the certification run can't even
  // fit the one step agent-evals.yml itself needs 60 minutes for.
  assert.ok(
    releaseReadinessTimeout > agentEvalsTimeout,
    `release-readiness.yml's job timeout (${releaseReadinessTimeout}m) must exceed agent-evals.yml's ` +
      `(${agentEvalsTimeout}m) — release-readiness runs that same full eval suite plus the rest of the pyramid`,
  );
});
