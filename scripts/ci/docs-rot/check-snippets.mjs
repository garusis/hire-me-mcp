#!/usr/bin/env node
/**
 * #59 — CLI entry point for the snippet-execution docs-rot guard.
 *
 * Reads README.md and docs/mcp.md off disk (the checked-in, generated
 * artifacts, #17/#23/#71), then runs every check in
 * `lib/run-snippet-checks.mjs` against the deployment named by
 * `--target-url` (or the `TARGET_URL` env var) — the ONE thing this script
 * takes as input rather than reading from a doc, since a target to test
 * against has to come from somewhere outside the docs themselves.
 *
 * Runnable locally against any deployment with a single command:
 *
 *   node scripts/ci/docs-rot/check-snippets.mjs --target-url=https://hire-me-mcp-web.vercel.app
 *
 * or, against a Vercel-protected preview, with the bypass secret set:
 *
 *   VERCEL_AUTOMATION_BYPASS_SECRET=... \
 *     node scripts/ci/docs-rot/check-snippets.mjs --target-url=https://<preview>.vercel.app
 *
 * Never prints the bypass secret — only whether one was applied.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bypassHeaders } from "./lib/bypass.mjs";
import { runSnippetChecks } from "./lib/run-snippet-checks.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

function parseTargetUrl(argv, env) {
  const flag = argv.find((arg) => arg.startsWith("--target-url="));
  const raw = flag ? flag.slice("--target-url=".length) : env.TARGET_URL;
  if (!raw) {
    throw new Error(
      "No target URL given. Pass --target-url=<url> or set TARGET_URL, e.g.:\n" +
        "  node scripts/ci/docs-rot/check-snippets.mjs --target-url=https://hire-me-mcp-web.vercel.app",
    );
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

async function main() {
  const targetUrl = parseTargetUrl(process.argv.slice(2), process.env);
  const headers = bypassHeaders(process.env);

  console.log(`docs-rot snippet checks — target deployment: ${targetUrl}`);
  console.log(
    Object.keys(headers).length > 0
      ? "Vercel Deployment Protection bypass header applied (value not printed)."
      : "No bypass header applied (unprotected origin, e.g. production or local).",
  );

  const readmeText = readFileSync(resolve(REPO_ROOT, "README.md"), "utf-8");
  const docsMcpText = readFileSync(resolve(REPO_ROOT, "docs", "mcp.md"), "utf-8");

  const { ok, failures, notes } = await runSnippetChecks({
    targetUrl,
    readmeText,
    docsMcpText,
    headers,
  });

  for (const note of notes) {
    console.log(`NOTE: ${note}`);
  }

  if (ok) {
    console.log("All documented MCP connection snippets are true against the live endpoint.");
    return;
  }

  console.error(`\n${failures.length} docs-rot snippet check(s) failed:\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    "\nEach failure above names the exact file/region or live artifact that is stale relative to the deployment.",
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`docs-rot snippet check crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
