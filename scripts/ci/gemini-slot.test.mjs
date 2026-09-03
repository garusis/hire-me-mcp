/**
 * #264 follow-up — unit tests for the Gemini slot lease. Plain
 * `node --test`, same convention as `eval-relevance.test.mjs`.
 * Run: `pnpm ci:gemini-slot:test` (or `pnpm ci:scripts:test`).
 *
 * The last test is the one that keeps this honest over time: it reads the
 * real workflow files and asserts the `SLOT_BUDGET` each one declares
 * matches `BUDGETS` in both directions, so a workflow can never join a
 * budget the script doesn't know about, and a budget can never list a
 * workflow that stopped asking for a slot.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  acquireSlot,
  BUDGETS,
  describeBlockers,
  resolveCohort,
  selectBlockingRuns,
} from "./gemini-slot.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const RETRIEVAL = ".github/workflows/retrieval-eval.yml";
const AGENT_EVALS = ".github/workflows/agent-evals.yml";
const CHAT_LIVE = ".github/workflows/preview-chat-live.yml";
const REINDEX = ".github/workflows/reindex-production.yml";
const RELEASE = ".github/workflows/release-readiness.yml";

function run(id, path, status = "in_progress") {
  return { id, path, status, name: path, html_url: `https://example.test/${id}` };
}

test("resolveCohort expands one budget to its workflows", () => {
  const { budgets, cohort } = resolveCohort("ci-embedding");
  assert.deepEqual(budgets, ["ci-embedding"]);
  assert.ok(cohort.includes(RETRIEVAL));
  assert.ok(cohort.includes(REINDEX));
  // #296 correction: agent-evals.yml's RAG-grounded/story-manifest eval
  // cases drive real search-career calls (embedding, ci-embedding budget),
  // so it belongs in this cohort now — preview-chat-live never does (it
  // spends the Vercel *Preview* project's key, not the Actions secret).
  assert.ok(cohort.includes(AGENT_EVALS));
  assert.ok(!cohort.includes(CHAT_LIVE));
});

test("resolveCohort unions and de-duplicates multiple budgets", () => {
  const { cohort } = resolveCohort("ci-embedding, ci-generation");
  assert.equal(cohort.filter((path) => path === RELEASE).length, 1);
  assert.ok(cohort.includes(AGENT_EVALS));
  assert.ok(cohort.includes(RETRIEVAL));
});

test("resolveCohort rejects an unknown or empty budget", () => {
  assert.throws(() => resolveCohort(""), /SLOT_BUDGET is empty/);
  assert.throws(() => resolveCohort("gemini-free-tier"), /Unknown budget/);
});

test("the required check is not blocked by budgets it does not spend", () => {
  // The whole point of splitting the old single `gemini-free-tier` group:
  // preview-chat-live spends the Vercel *Preview* project's key, which
  // retrieval-eval (Actions-secret key, embedding model) never touches.
  // agent-evals.yml is no longer a valid second example here (#296
  // correction: it now genuinely spends ci-embedding too), so the second
  // run below is a workflow that never asks for any Gemini slot at all.
  const { cohort } = resolveCohort("ci-embedding");
  const blockers = selectBlockingRuns({
    runs: [run(100, CHAT_LIVE), run(101, ".github/workflows/ci.yml")],
    selfRunId: 200,
    cohort,
  });
  assert.deepEqual(blockers, []);
});

test("older cohort runs block; newer ones do not (FIFO by run id)", () => {
  const { cohort } = resolveCohort("ci-embedding");
  const blockers = selectBlockingRuns({
    runs: [run(50, RETRIEVAL), run(300, RETRIEVAL), run(60, REINDEX)],
    selfRunId: 200,
    cohort,
  });
  assert.deepEqual(
    blockers.map((blocker) => blocker.id),
    [50, 60],
  );
});

test("the oldest live run in a cohort is always unblocked (no deadlock)", () => {
  const { cohort } = resolveCohort("ci-embedding");
  const runs = [run(10, RETRIEVAL), run(20, RETRIEVAL), run(30, REINDEX)];
  const unblocked = runs.filter(
    (candidate) => selectBlockingRuns({ runs, selfRunId: candidate.id, cohort }).length === 0,
  );
  assert.deepEqual(
    unblocked.map((candidate) => candidate.id),
    [10],
  );
});

test("overlapping cohorts stay acyclic — release-readiness waits on both budgets", () => {
  const { cohort } = resolveCohort("ci-embedding,ci-generation");
  const blockers = selectBlockingRuns({
    runs: [run(11, RETRIEVAL), run(12, AGENT_EVALS), run(99, RETRIEVAL)],
    selfRunId: 50,
    cohort,
  });
  assert.deepEqual(
    blockers.map((blocker) => blocker.id),
    [11, 12],
  );
});

test("completed runs never block", () => {
  const { cohort } = resolveCohort("ci-embedding");
  const blockers = selectBlockingRuns({
    runs: [run(1, RETRIEVAL, "completed"), run(2, RETRIEVAL, "queued")],
    selfRunId: 900,
    cohort,
  });
  assert.deepEqual(
    blockers.map((blocker) => blocker.id),
    [2],
  );
});

test("a run never blocks on itself", () => {
  const { cohort } = resolveCohort("ci-embedding");
  assert.deepEqual(selectBlockingRuns({ runs: [run(7, RETRIEVAL)], selfRunId: 7, cohort }), []);
});

test("selectBlockingRuns rejects a non-numeric run id rather than guessing", () => {
  const { cohort } = resolveCohort("ci-embedding");
  assert.throws(
    () => selectBlockingRuns({ runs: [], selfRunId: "", cohort }),
    /GITHUB_RUN_ID is not a number/,
  );
});

test("acquireSlot returns immediately when the cohort is idle", async () => {
  const result = await acquireSlot({
    budgetSpec: "ci-embedding",
    repository: "o/r",
    selfRunId: 5,
    maxWaitSeconds: 600,
    pollSeconds: 1,
    listRuns: async () => [],
    now: () => 0,
    wait: async () => assert.fail("should not have waited"),
    log: () => {},
  });
  assert.equal(result.acquired, true);
  assert.equal(result.timedOut, false);
});

test("acquireSlot waits, then proceeds once the older run finishes", async () => {
  let poll = 0;
  const waits = [];
  const result = await acquireSlot({
    budgetSpec: "ci-embedding",
    repository: "o/r",
    selfRunId: 5,
    maxWaitSeconds: 600,
    pollSeconds: 20,
    listRuns: async () => {
      poll += 1;
      return poll < 3 ? [run(1, RETRIEVAL)] : [run(1, RETRIEVAL, "completed")];
    },
    now: () => 0,
    wait: async (ms) => waits.push(ms),
    log: () => {},
  });
  assert.equal(result.acquired, true);
  assert.deepEqual(waits, [20_000, 20_000]);
});

test("acquireSlot FAILS OPEN on timeout — never blocks the job", async () => {
  let clock = 0;
  const result = await acquireSlot({
    budgetSpec: "ci-embedding",
    repository: "o/r",
    selfRunId: 5,
    maxWaitSeconds: 60,
    pollSeconds: 20,
    listRuns: async () => [run(1, RETRIEVAL)],
    now: () => {
      clock += 30_000;
      return clock;
    },
    wait: async () => {},
    log: () => {},
  });
  assert.equal(result.acquired, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.blockers.length, 1);
});

test("describeBlockers names the run so a waiting log is actionable", () => {
  assert.equal(describeBlockers([run(42, RETRIEVAL, "queued")]), `${RETRIEVAL} #42 (queued)`);
});

test("every workflow's declared SLOT_BUDGET matches BUDGETS, in both directions", () => {
  const declared = new Map();
  for (const path of new Set(Object.values(BUDGETS).flat())) {
    const source = readFileSync(resolve(REPO_ROOT, path), "utf-8");
    const match = source.match(/^\s*SLOT_BUDGET:\s*"?([a-z0-9,\s-]+?)"?\s*$/m);
    assert.ok(match, `${path} is listed in BUDGETS but declares no SLOT_BUDGET env`);
    declared.set(
      path,
      match[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .sort(),
    );
  }

  for (const [path, budgets] of declared) {
    const fromTable = Object.entries(BUDGETS)
      .filter(([, paths]) => paths.includes(path))
      .map(([name]) => name)
      .sort();
    assert.deepEqual(
      budgets,
      fromTable,
      `${path} declares SLOT_BUDGET=${budgets.join(",")} but BUDGETS says ${fromTable.join(",")}`,
    );
  }
});

test("no workflow still uses the old single gemini-free-tier concurrency group", () => {
  // #264: that group is what cancelled a required check. If it comes back,
  // this test is the tripwire.
  for (const path of new Set(Object.values(BUDGETS).flat())) {
    const source = readFileSync(resolve(REPO_ROOT, path), "utf-8");
    const offending = source
      .split("\n")
      .filter((line) => /^\s*group:\s*gemini-free-tier\s*$/.test(line));
    assert.deepEqual(offending, [], `${path} re-introduced the gemini-free-tier concurrency group`);
  }
});
