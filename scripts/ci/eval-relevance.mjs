/**
 * #207 — in-job relevance detection for the Gemini-spending eval workflows
 * (`agent-evals.yml`, `retrieval-eval.yml`).
 *
 * ## Why this exists (the #176 lesson, restated)
 *
 * Both eval workflows are (or may become) required PR checks, and a
 * required check that never runs leaves a PR permanently "Expected —
 * waiting for status". So the workflows trigger on EVERY pull request and
 * decide relevance here, in-job: an irrelevant PR reports green in
 * seconds with zero Gemini calls; a relevant one runs the real suite.
 * Never workflow-level `paths:` filters.
 *
 * ## How relevance is decided (two signals, OR-ed)
 *
 * 1. **Turborepo dependency graph** (`turbo query` / `affectedPackages`):
 *    the eval suite is relevant iff its target package (e.g.
 *    `@hire-me-mcp/agent`) appears in the set of packages affected by the
 *    diff between the PR's merge base and HEAD. Turbo's affected set
 *    includes transitive dependents of every changed package, so "a
 *    dependency of agent code changed" (the failure mode of a
 *    hand-maintained glob list or a filename convention like
 *    `.agents.ts`) is caught without anyone maintaining a list. Lockfile
 *    changes are attributed per-package by turbo's lockfile analysis, and
 *    root-package changes (root `package.json`, `turbo.json`) cascade to
 *    every package.
 * 2. **Explicit path regex** for assets the module graph cannot see:
 *    the workflow file itself, CI helper scripts, and any wiring outside
 *    the target package's dependency closure (e.g. the chat route).
 *
 * A PR label (default `run-evals`) overrides both signals — see
 * `docs/development.md` > "What triggers the eval workflows".
 *
 * ## Fail-open contract
 *
 * ANY error in detection (git failure, turbo failure, malformed output)
 * makes the run relevant. A broken detector must cost quota, never
 * silently skip a gate.
 *
 * Inputs (env):
 *   EVENT_NAME        github.event_name; anything but pull_request/push
 *                     (e.g. workflow_dispatch) is always relevant
 *   BASE_REF          git rev to diff against (PR: origin/<base-branch>;
 *                     push: the before sha). Merge base with HEAD is
 *                     computed here, so a base branch that moved ahead
 *                     never drags unrelated changes into the diff.
 *   TARGET_PACKAGE    workspace package whose affectedness means "run"
 *   EXTRA_PATH_REGEX  extended regex matched against changed file paths
 *   OVERRIDE_LABEL    label name that forces a run (default: run-evals)
 *   PR_LABELS         newline-separated label names on the PR (optional)
 *   GITHUB_OUTPUT     step-output file; `relevant=true|false` and
 *                     `reason=...` are appended when set
 *
 * Unit tests: `scripts/ci/eval-relevance.test.mjs` (`node --test`, same
 * convention as `neon-branch-cleanup.test.mjs`); run via
 * `pnpm ci:eval-relevance:test`.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

/**
 * Extract package names from `turbo query`'s affectedPackages JSON.
 * Throws on any shape surprise — the caller fails open.
 */
export function parseAffectedPackages(queryOutputJson) {
  const parsed = JSON.parse(queryOutputJson);
  const items = parsed?.data?.affectedPackages?.items;
  if (!Array.isArray(items)) {
    throw new Error(`Unexpected turbo query output shape: ${queryOutputJson.slice(0, 200)}`);
  }
  return items.map((item) => {
    if (typeof item?.name !== "string") {
      throw new Error("Unexpected turbo query item without a string name");
    }
    return item.name;
  });
}

/**
 * Pure relevance decision. Returns { relevant, reason } — `reason` is a
 * human-readable one-liner for the job log / step output.
 */
export function decideRelevance({
  eventName,
  labels = [],
  overrideLabel = "run-evals",
  targetPackage,
  affectedPackages,
  changedFiles,
  extraPathRegex,
}) {
  if (eventName !== "pull_request" && eventName !== "push") {
    return {
      relevant: true,
      reason: `event ${eventName} always runs the full suite`,
    };
  }
  if (labels.includes(overrideLabel)) {
    return {
      relevant: true,
      reason: `PR carries the '${overrideLabel}' override label`,
    };
  }
  if (!targetPackage) {
    throw new Error("TARGET_PACKAGE is required");
  }
  if (affectedPackages.includes(targetPackage)) {
    return {
      relevant: true,
      reason: `${targetPackage} is in turbo's affected-package set (its own files or a dependency changed)`,
    };
  }
  if (extraPathRegex) {
    const regex = new RegExp(extraPathRegex);
    const hit = changedFiles.find((file) => regex.test(file));
    if (hit) {
      return {
        relevant: true,
        reason: `changed file matches the explicit asset list: ${hit}`,
      };
    }
  }
  return {
    relevant: false,
    reason: `${targetPackage} not affected and no changed file matches the explicit asset list`,
  };
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function writeOutput(relevant, reason) {
  const line = `relevant=${relevant}\nreason=${reason}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, line);
  }
  console.log(
    `::notice::eval-relevance: relevant=${relevant} — ${reason}${
      relevant ? "" : " Skipping Gemini-spending steps; the check reports green (#176)."
    }`,
  );
}

function main() {
  const eventName = process.env.EVENT_NAME ?? "";
  const labels = (process.env.PR_LABELS ?? "")
    .split("\n")
    .map((label) => label.trim())
    .filter(Boolean);
  const overrideLabel = process.env.OVERRIDE_LABEL || "run-evals";
  const targetPackage = process.env.TARGET_PACKAGE ?? "";
  const extraPathRegex = process.env.EXTRA_PATH_REGEX ?? "";

  // Cheap decisions first — no git/turbo needed for dispatch or an
  // override label, so those paths cannot fail.
  if (eventName !== "pull_request" && eventName !== "push") {
    writeOutput(true, `event ${eventName} always runs the full suite`);
    return;
  }
  if (labels.includes(overrideLabel)) {
    writeOutput(true, `PR carries the '${overrideLabel}' override label`);
    return;
  }

  const baseRef = process.env.BASE_REF ?? "";
  if (!baseRef || /^0+$/.test(baseRef)) {
    // e.g. github.event.before on a branch-creation push — nothing to
    // diff against, fail open.
    throw new Error(`BASE_REF is empty or a zero sha ('${baseRef}')`);
  }

  const mergeBase = run("git", ["merge-base", baseRef, "HEAD"]).trim();
  const queryOutput = run("pnpm", [
    "exec",
    "turbo",
    "query",
    `query { affectedPackages(base: "${mergeBase}", head: "HEAD") { items { name } } }`,
  ]);
  const affectedPackages = parseAffectedPackages(queryOutput);
  const changedFiles = run("git", ["diff", "--name-only", `${mergeBase}...HEAD`])
    .split("\n")
    .filter(Boolean);

  const decision = decideRelevance({
    eventName,
    labels,
    overrideLabel,
    targetPackage,
    affectedPackages,
    changedFiles,
    extraPathRegex,
  });
  writeOutput(decision.relevant, decision.reason);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    // Fail OPEN: a broken detector runs the evals rather than silently
    // skipping a gate (#207).
    console.error(error);
    writeOutput(
      true,
      `relevance detection failed (${error?.message ?? error}) — failing open and running the full suite`,
    );
  }
}
