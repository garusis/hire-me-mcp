#!/usr/bin/env node
/**
 * #264 follow-up — in-job serialization ("slot lease") for the workflows
 * that spend a shared Gemini free-tier budget.
 *
 * ## Why this exists: a GitHub concurrency group is a canceller, not a queue
 *
 * Every Gemini-spending workflow used to carry `concurrency: { group:
 * gemini-free-tier, cancel-in-progress: false }` so they would "queue
 * rather than race" for the free tier. GitHub does not implement that.
 * A concurrency group holds exactly ONE run in progress and exactly ONE
 * run pending; when a third run enters the group, the previously pending
 * run is **cancelled outright**. A cancelled run reports as a failed check
 * (`gh pr checks` prints "fail"), so with `retrieval-eval`, `agent-evals`
 * and `preview-chat-live` all contending, an ordinary day with two or
 * three open PRs turned a REQUIRED check red for a reason that had nothing
 * to do with the change — the exact failure mode #176 and #264 exist to
 * eliminate — and every merge needed hand-serialized re-runs.
 *
 * There is no way to make GitHub queue more than one run. So the queue
 * moves in-job, here: a job asks for its budget's slot, waits until it
 * holds it, and then does the expensive work. No run is ever cancelled,
 * because no run is ever pending at the GitHub level.
 *
 * ## Budgets, not "is this a Gemini job"
 *
 * The old single group serialized jobs that cannot actually starve each
 * other. Google's free tier is per project AND per model (see
 * `docs/development.md` > "The three Google keys"), and the cohort spends
 * three different allowances:
 *
 * | Budget               | Credential slot         | Model                  |
 * | -------------------- | ----------------------- | ---------------------- |
 * | `ci-embedding`       | `GOOGLE_..._API_KEY` Actions secret | `gemini-embedding-001` |
 * | `ci-generation`      | `GOOGLE_..._API_KEY` Actions secret | `gemini-3.5-flash-lite` |
 * | `preview-generation` | the Vercel **Preview** environment's key | `gemini-3.5-flash-lite` |
 *
 * `retrieval-eval` (embeddings, CI key) and `preview-chat-live` (a
 * deployed preview's chat, Preview key) never shared an allowance in the
 * first place; serializing them bought nothing and cost a required check.
 * A workflow that genuinely spends two budgets (`release-readiness` runs
 * both the retrieval and the agent evals) names both.
 *
 * ## The lease: FIFO by run id, no deadlock, no starvation
 *
 * A run may proceed when no OLDER live run (lower `id`, status `queued` or
 * `in_progress`) of any workflow in its budget's cohort exists. "Blocks"
 * is therefore a strict order on run ids: it can never cycle, the oldest
 * live run in any cohort is always unblocked, and every waiter eventually
 * becomes the oldest. Overlapping cohorts (`release-readiness`) are safe
 * for the same reason.
 *
 * ## Fail-open, bounded, and loud
 *
 * The wait is bounded (`SLOT_MAX_WAIT_SECONDS`). On timeout — or on ANY
 * API/parse error — this script prints a `::warning::`, records it in the
 * job summary, and exits 0 so the job proceeds. A queueing mechanism must
 * never be able to redden a required gate; the worst case of giving up is
 * the contention we had before, not a blocked merge.
 *
 * Callers place this step AFTER their relevance/secrets detection, so a PR
 * that is going to spend nothing never waits for anything.
 *
 * Inputs (env):
 *   SLOT_BUDGET             comma-separated budget names (see BUDGETS)
 *   GITHUB_REPOSITORY       owner/repo
 *   GITHUB_RUN_ID           this run's id (the lease's ticket number)
 *   GH_TOKEN                token with actions:read
 *   SLOT_MAX_WAIT_SECONDS   default 600
 *   SLOT_POLL_SECONDS       default 20
 *   GITHUB_STEP_SUMMARY     appended to when set
 *
 * Unit tests: `scripts/ci/gemini-slot.test.mjs` (`node --test`, same
 * convention as `eval-relevance.test.mjs`); run via
 * `pnpm ci:gemini-slot:test` or the aggregate `pnpm ci:scripts:test`.
 */

import { appendFileSync } from "node:fs";

/**
 * Budget name → the workflow files whose runs spend it. Kept in sync with
 * each workflow's own `SLOT_BUDGET` env value by a test in
 * `gemini-slot.test.mjs` that reads the real workflow files and compares
 * both directions, so this table cannot drift from what CI declares.
 */
export const BUDGETS = {
  "ci-embedding": [
    ".github/workflows/retrieval-eval.yml",
    ".github/workflows/reindex-production.yml",
    ".github/workflows/release-readiness.yml",
  ],
  "ci-generation": [".github/workflows/agent-evals.yml", ".github/workflows/release-readiness.yml"],
  "preview-generation": [".github/workflows/preview-chat-live.yml"],
};

/** Run statuses that still hold (or are about to hold) a slot. */
const LIVE_STATUSES = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);

/**
 * @param {string} budgetSpec comma-separated budget names
 * @returns {{ budgets: string[], cohort: string[] }}
 */
export function resolveCohort(budgetSpec) {
  const budgets = String(budgetSpec ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (budgets.length === 0) {
    throw new Error("SLOT_BUDGET is empty — name at least one budget from BUDGETS.");
  }
  const unknown = budgets.filter((name) => !(name in BUDGETS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown budget(s): ${unknown.join(", ")}. Known budgets: ${Object.keys(BUDGETS).join(", ")}.`,
    );
  }
  const cohort = [...new Set(budgets.flatMap((name) => BUDGETS[name]))].sort();
  return { budgets, cohort };
}

/**
 * The live cohort runs this run must wait for: older (lower id) runs of a
 * workflow in the cohort. Pure — the whole ordering rule lives here so the
 * tests can assert it without touching the network.
 *
 * @param {{ runs: Array<{ id: number|string, path?: string, status?: string, name?: string, html_url?: string }>, selfRunId: number|string, cohort: string[] }} input
 */
export function selectBlockingRuns({ runs, selfRunId, cohort }) {
  // `Number("")` is 0, which would silently make this run the oldest in
  // every cohort and defeat the lease — demand actual digits.
  if (!/^\d+$/.test(String(selfRunId).trim())) {
    throw new Error(`GITHUB_RUN_ID is not a number: '${selfRunId}'`);
  }
  const self = Number(selfRunId);
  const inCohort = new Set(cohort);
  return (runs ?? [])
    .filter((run) => inCohort.has(run.path ?? ""))
    .filter((run) => LIVE_STATUSES.has(run.status ?? ""))
    .filter((run) => Number(run.id) !== self && Number(run.id) < self)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** One-line, human-readable description of who we are waiting for. */
export function describeBlockers(blockers) {
  return blockers.map((run) => `${run.name ?? run.path} #${run.id} (${run.status})`).join(", ");
}

function appendSummary(lines) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) {
    return;
  }
  try {
    appendFileSync(target, `${lines.join("\n")}\n`);
  } catch (error) {
    console.error(`Could not write the job summary: ${error?.message ?? error}`);
  }
}

async function fetchLiveRuns({ repository, token }) {
  const collected = [];
  for (const status of ["in_progress", "queued"]) {
    const url = `https://api.github.com/repos/${repository}/actions/runs?status=${status}&per_page=100`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} → HTTP ${response.status}`);
    }
    const body = await response.json();
    collected.push(...(body.workflow_runs ?? []));
  }
  return collected;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function acquireSlot({
  budgetSpec,
  repository,
  selfRunId,
  token,
  maxWaitSeconds,
  pollSeconds,
  listRuns = fetchLiveRuns,
  now = () => Date.now(),
  wait = sleep,
  log = console.log,
}) {
  const { budgets, cohort } = resolveCohort(budgetSpec);
  const deadline = now() + maxWaitSeconds * 1000;
  const startedAt = now();

  log(`Gemini slot lease — budget(s): ${budgets.join(", ")}`);
  log(`Cohort: ${cohort.join(", ")}`);
  log(`This run: ${selfRunId}. FIFO by run id; older cohort runs go first.`);

  let attempt = 0;
  for (;;) {
    attempt += 1;
    const runs = await listRuns({ repository, token });
    const blockers = selectBlockingRuns({ runs, selfRunId, cohort });
    if (blockers.length === 0) {
      const waitedSeconds = Math.round((now() - startedAt) / 1000);
      log(`Slot acquired after ${waitedSeconds}s (${attempt} check(s)).`);
      return { acquired: true, waitedSeconds, timedOut: false, budgets };
    }
    if (now() >= deadline) {
      const waitedSeconds = Math.round((now() - startedAt) / 1000);
      return {
        acquired: false,
        waitedSeconds,
        timedOut: true,
        budgets,
        blockers,
      };
    }
    log(`Waiting for ${blockers.length} older cohort run(s): ${describeBlockers(blockers)}`);
    await wait(pollSeconds * 1000);
  }
}

async function main() {
  const budgetSpec = process.env.SLOT_BUDGET ?? "";
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const selfRunId = process.env.GITHUB_RUN_ID ?? "";
  const maxWaitSeconds = Number(process.env.SLOT_MAX_WAIT_SECONDS || 600);
  const pollSeconds = Number(process.env.SLOT_POLL_SECONDS || 20);

  const result = await acquireSlot({
    budgetSpec,
    repository,
    selfRunId,
    token: process.env.GH_TOKEN,
    maxWaitSeconds,
    pollSeconds,
  });

  if (result.acquired) {
    appendSummary([
      "### Gemini free-tier slot",
      "",
      `Held budget \`${result.budgets.join("`, `")}\` after waiting ${result.waitedSeconds}s.`,
      "",
    ]);
    return;
  }

  // Timed out: proceed anyway. Documented contract — see the module doc.
  console.log(
    `::warning::Gave up waiting for the Gemini slot after ${result.waitedSeconds}s; running anyway. ` +
      `Still live: ${describeBlockers(result.blockers)}. If this job now fails with a rate-limit error, ` +
      "that is contention, not a product regression — re-run it after the daily reset (~07:00 UTC).",
  );
  appendSummary([
    "### Gemini free-tier slot",
    "",
    `**Not acquired** — waited ${result.waitedSeconds}s for budget \`${result.budgets.join("`, `")}\` and ran anyway (fail-open).`,
    "",
    `Still live when we gave up: ${describeBlockers(result.blockers)}`,
    "",
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // Fail OPEN: a broken lease must never block a job, least of all a
    // required one (#264).
    console.log(
      `::warning::Gemini slot lease failed (${error?.message ?? error}) — proceeding without it.`,
    );
    appendSummary([
      "### Gemini free-tier slot",
      "",
      `**Lease unavailable** (${error?.message ?? error}) — proceeded without serialization (fail-open).`,
      "",
    ]);
  });
}
