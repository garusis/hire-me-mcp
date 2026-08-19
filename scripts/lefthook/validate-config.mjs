#!/usr/bin/env node
// Validates that lefthook.yml parses and defines the pre-commit jobs this
// repo relies on (AC: "A repo test/CI step validates lefthook.yml parses
// and defines the expected pre-commit jobs").
//
// Plain Node + `lefthook dump`/`lefthook validate` — no test framework or
// YAML-parsing dependency needed, so this can run as its own package
// script (`pnpm validate:lefthook`) from any pipeline, including one #27
// wires into CI, without adding it to the turbo task graph.
import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync("pnpm", ["exec", "lefthook", ...args], {
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

// 1. Schema validation: lefthook's own `validate` command confirms
//    lefthook.yml parses and matches lefthook's config schema.
const validate = run(["validate"]);
if (validate.status !== 0) {
  fail(`lefthook validate failed:\n${validate.stdout}${validate.stderr}`);
  process.exit(1);
}
console.log("✔ lefthook.yml parses and matches the lefthook config schema");

// 2. Content assertions: confirm the specific jobs this repo depends on
//    are actually present, using `lefthook dump -f json` (the merged,
//    already-parsed config) rather than re-parsing YAML by hand.
const dump = run(["dump", "-f", "json"]);
if (dump.status !== 0) {
  fail(`lefthook dump failed:\n${dump.stdout}${dump.stderr}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(dump.stdout);
} catch (error) {
  fail(`lefthook dump did not print valid JSON: ${error.message}`);
  process.exit(1);
}

const preCommit = config["pre-commit"];
if (!preCommit) {
  fail("lefthook.yml does not define a pre-commit hook");
}

const jobs = preCommit?.jobs ?? [];
const jobNames = jobs.map((job) => job.name);

for (const expected of ["biome", "tests"]) {
  if (!jobNames.includes(expected)) {
    fail(
      `pre-commit is missing the expected "${expected}" job (found: ${jobNames.join(", ") || "none"})`,
    );
  }
}

const biomeJob = jobs.find((job) => job.name === "biome");
if (biomeJob && biomeJob.stage_fixed !== true) {
  fail('pre-commit "biome" job must set stage_fixed: true so Biome fixes are re-staged');
}

const testsJob = jobs.find((job) => job.name === "tests");
if (testsJob && !/\bturbo\b.*\brun\b.*\btest\b/.test(testsJob.run ?? "")) {
  fail('pre-commit "tests" job must run tests through turbo (affected-package scoping)');
}
if (testsJob && !/--filter=/.test(testsJob.run ?? "")) {
  fail('pre-commit "tests" job must scope via a turbo --filter (affected packages only)');
}
if (testsJob && /playwright|e2e/i.test(testsJob.run ?? "")) {
  fail('pre-commit "tests" job must never run Playwright/E2E tests');
}

if (process.exitCode === 1) {
  process.exit(1);
}

console.log(`✔ pre-commit defines the expected jobs: ${jobNames.join(", ")}`);
console.log("✔ biome job re-stages fixes (stage_fixed: true)");
console.log("✔ tests job is turbo-filtered and Playwright/E2E-free");
