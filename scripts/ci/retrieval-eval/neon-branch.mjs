#!/usr/bin/env node
/**
 * Minimal Neon branch create/delete helper for
 * `.github/workflows/retrieval-eval.yml` (#41, epic #6). Deliberately a
 * standalone, dependency-free script — no `packages/core` import, so it
 * needs no build step before use, the same "plain Node, zero npm
 * dependencies" convention `scripts/ci/docs-rot/*` already establishes.
 * It duplicates (rather than imports) the small create/delete calls
 * `packages/core/src/db/neon-branch.ts` makes for the integration test
 * suites — this script runs in a workflow step, before any package is
 * built, so importing that module's compiled output isn't an option.
 *
 * Usage:
 *   node scripts/ci/retrieval-eval/neon-branch.mjs create
 *     Creates a branch, appends `DATABASE_URL=...` to `$GITHUB_ENV` (so
 *     later steps in the same job see it as a normal env var) and
 *     `branch-id=...` to `$GITHUB_OUTPUT`. Masks the branch's password in
 *     the job log via `::add-mask::`.
 *
 *   NEON_BRANCH_ID=<id> node scripts/ci/retrieval-eval/neon-branch.mjs delete
 *     Deletes the branch by id. Treats 404 as success (idempotent).
 *
 * Both modes require `NEON_API_KEY` and `NEON_PROJECT_ID` in the
 * environment.
 */

const NEON_API_BASE = "https://console.neon.tech/api/v2";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

async function createBranch(apiKey, projectId) {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: { name: `hire-me-mcp-retrieval-eval-${Date.now()}-${randomSuffix()}` },
      endpoints: [{ type: "read_write" }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Neon branch creation failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const uri = json.connection_uris?.[0];
  if (!uri) {
    throw new Error("Neon branch creation response is missing connection_uris.");
  }
  const { role, password, database, pooler_host: poolerHost } = uri.connection_parameters;
  const databaseUrl = `postgresql://${role}:${encodeURIComponent(password)}@${poolerHost}/${database}?sslmode=require`;
  return { branchId: json.branch.id, databaseUrl, password };
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

async function appendToFile(path, contents) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, contents, "utf8");
}

async function runCreate(apiKey, projectId) {
  const { branchId, databaseUrl, password } = await createBranch(apiKey, projectId);

  // Mask the password before it can appear in any subsequent log line.
  console.log(`::add-mask::${password}`);

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    await appendToFile(githubEnv, `DATABASE_URL=${databaseUrl}\n`);
  }
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    await appendToFile(githubOutput, `branch-id=${branchId}\n`);
  }
  console.log(`Created Neon branch ${branchId} for the retrieval eval run.`);
}

async function runDelete(apiKey, projectId) {
  const branchId = requireEnv("NEON_BRANCH_ID");
  await deleteBranch(apiKey, projectId, branchId);
  console.log(`Deleted Neon branch ${branchId}.`);
}

async function main() {
  const mode = process.argv[2];
  const apiKey = requireEnv("NEON_API_KEY");
  const projectId = requireEnv("NEON_PROJECT_ID");

  if (mode === "create") {
    await runCreate(apiKey, projectId);
  } else if (mode === "delete") {
    await runDelete(apiKey, projectId);
  } else {
    throw new Error(`Unknown mode "${mode}" — expected "create" or "delete".`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
