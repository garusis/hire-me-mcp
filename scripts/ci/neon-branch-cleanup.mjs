#!/usr/bin/env node
/**
 * Stale-branch safety net (#52, epic #6): every CI job that provisions a
 * disposable Neon branch (`retrieval-eval`/`db-integration`'s
 * `rag-store.integration.test.ts` / `run.integration.test.ts` /
 * `search-career.integration.test.ts`, all via
 * `packages/core/src/db/neon-branch.ts` or this repo's standalone
 * `scripts/ci/retrieval-eval/neon-branch.mjs`) deletes its own branch in an
 * `always()` step — but a hard runner crash, a cancelled-mid-step run, or a
 * bug in that cleanup step can still leak a branch. Every CI-created branch
 * name starts with `hire-me-mcp-` (see the `namePrefix`/branch-name
 * arguments at each call site) — this script lists every branch on the
 * project, deletes the ones matching that prefix that are older than a
 * configurable age (default 24h), and explicitly refuses to touch a
 * branch Neon reports as `default` or `protected` (the project's real
 * primary/production branch), so a naming coincidence can never delete
 * anything that matters.
 *
 * `findStaleBranches` is pure — no I/O — so it's unit-tested without a real
 * Neon project (see `neon-branch-cleanup.test.mjs`). `main()` is the CLI
 * wrapper: list branches, filter, delete, print what happened.
 *
 * Usage (requires NEON_API_KEY / NEON_PROJECT_ID in the environment):
 *   node scripts/ci/neon-branch-cleanup.mjs                    # 24h default
 *   node scripts/ci/neon-branch-cleanup.mjs --max-age-hours=6
 *   node scripts/ci/neon-branch-cleanup.mjs --dry-run           # list only, delete nothing
 */

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const DEFAULT_NAME_PREFIX = "hire-me-mcp-";
const DEFAULT_MAX_AGE_HOURS = 24;

/**
 * Given a project's full branch list (Neon's `GET /branches` response
 * shape: `{ id, name, created_at, default, protected }[]`), returns the
 * subset that are safe and due to be deleted: name starts with
 * `namePrefix`, `created_at` is older than `now - maxAgeMs`, and neither
 * `default` nor `protected` is true.
 */
export function findStaleBranches(
  branches,
  {
    now = new Date(),
    maxAgeMs = DEFAULT_MAX_AGE_HOURS * 60 * 60 * 1000,
    namePrefix = DEFAULT_NAME_PREFIX,
  } = {},
) {
  const cutoff = now.getTime() - maxAgeMs;
  return branches.filter((branch) => {
    if (branch.default || branch.protected) return false;
    if (!branch.name?.startsWith(namePrefix)) return false;
    const createdAt = new Date(branch.created_at).getTime();
    return createdAt < cutoff;
  });
}

async function listBranches(apiKey, projectId) {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Neon branch list failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.branches ?? [];
}

async function deleteBranch(apiKey, projectId, branchId) {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Neon branch deletion failed: ${res.status} ${await res.text()}`);
  }
}

function parseArgs(argv) {
  const args = { maxAgeHours: DEFAULT_MAX_AGE_HOURS, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--max-age-hours=")) {
      args.maxAgeHours = Number(arg.split("=")[1]);
    }
  }
  return args;
}

async function main() {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error("NEON_API_KEY and NEON_PROJECT_ID are required.");
  }

  const { maxAgeHours, dryRun } = parseArgs(process.argv.slice(2));
  const branches = await listBranches(apiKey, projectId);
  const stale = findStaleBranches(branches, { maxAgeMs: maxAgeHours * 60 * 60 * 1000 });

  if (stale.length === 0) {
    console.log(`No stale hire-me-mcp-* branches older than ${maxAgeHours}h found.`);
    return;
  }

  console.log(`Found ${stale.length} stale branch(es) older than ${maxAgeHours}h:`);
  for (const branch of stale) {
    console.log(`  - ${branch.name} (${branch.id}), created ${branch.created_at}`);
  }

  if (dryRun) {
    console.log("--dry-run: not deleting.");
    return;
  }

  for (const branch of stale) {
    await deleteBranch(apiKey, projectId, branch.id);
    console.log(`Deleted ${branch.name} (${branch.id}).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
