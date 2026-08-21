#!/usr/bin/env node
/**
 * `pnpm generate:connect` / `pnpm generate:connect --check` (#17).
 *
 * Thin filesystem shell around `lib/mcp/generate-connect.ts`'s pure region
 * computation: reads `docs/mcp.md` and the root `README.md`, injects each
 * file's rendered `GeneratedRegion[]` between its `<!-- BEGIN/END
 * GENERATED: <id> -->` markers, and either writes the result back (default)
 * or, with `--check`, reports drift and exits non-zero without writing —
 * the mode CI runs so a hand-edited or stale generated region fails the
 * build instead of silently drifting from the real MCP tool registry.
 *
 * Always renders against the fixed production endpoint URL
 * (`PRODUCTION_MCP_ENDPOINT_URL`), not the runtime-resolved one — these are
 * documentation files describing the one public deployment, not a preview.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkGeneratedRegions,
  type GeneratedRegion,
  injectGeneratedRegions,
} from "@hire-me-mcp/connect-metadata";
import { computeDocsMcpRegions, computeReadmeRegions } from "../lib/mcp/generate-connect";
import { PRODUCTION_MCP_ENDPOINT_URL } from "../src/lib/config/site-url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");

interface GeneratedTarget {
  path: string;
  regions: GeneratedRegion[];
}

function buildTargets(): GeneratedTarget[] {
  return [
    {
      path: resolve(REPO_ROOT, "docs/mcp.md"),
      regions: computeDocsMcpRegions(PRODUCTION_MCP_ENDPOINT_URL),
    },
    {
      path: resolve(REPO_ROOT, "README.md"),
      regions: computeReadmeRegions(PRODUCTION_MCP_ENDPOINT_URL),
    },
  ];
}

function runCheck(targets: GeneratedTarget[]): boolean {
  let ok = true;
  for (const target of targets) {
    const source = readFileSync(target.path, "utf-8");
    const { drifted } = checkGeneratedRegions(source, target.regions);
    if (drifted.length > 0) {
      ok = false;
      console.error(`${target.path}: stale generated region(s): ${drifted.join(", ")}`);
    }
  }
  if (!ok) {
    console.error(
      "\ngenerate:connect --check failed — run `pnpm generate:connect` and commit the result.",
    );
  }
  return ok;
}

function runWrite(targets: GeneratedTarget[]): void {
  for (const target of targets) {
    const source = readFileSync(target.path, "utf-8");
    const next = injectGeneratedRegions(source, target.regions);
    if (next !== source) {
      writeFileSync(target.path, next);
      console.log(`updated ${target.path}`);
    } else {
      console.log(`up to date: ${target.path}`);
    }
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const targets = buildTargets();

  if (check) {
    const ok = runCheck(targets);
    if (!ok) {
      process.exit(1);
    }
    console.log("generate:connect --check: all generated regions are up to date.");
    return;
  }

  runWrite(targets);
}

main();
