#!/usr/bin/env node
/**
 * Generates a per-run `.lighthouserc.local.json` for the Lighthouse budget
 * gate (#58, extended to a full performance-budget gate by #62): five URLs
 * (home, one project detail, /privacy, the CV print view, and the MCP
 * section) resolved against `BASE_URL`, plus the Vercel Deployment
 * Protection bypass header (`VERCEL_AUTOMATION_BYPASS_SECRET`, if set) so
 * Lighthouse's own headless Chrome can load a protected preview. This is
 * generated at run time, never committed, specifically so the bypass
 * secret's value never lands in a tracked file — see `.gitignore`. The
 * static `lighthouserc.json` at the repo root documents the per-page
 * assertion thresholds (via `assert.assertMatrix` — different pages carry
 * different budgets); this script only fills in the per-run URLs/headers.
 *
 * The project detail slug is resolved the same way the content-correctness
 * spec does (`apps/web/e2e-preview/helpers/dataset.ts`) — via
 * `@hire-me-mcp/core` directly, reading the real dataset rather than
 * hardcoding a slug that could go stale.
 *
 * Usage: BASE_URL=<origin> node scripts/lighthouse/build-config.mjs > .lighthouserc.local.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createContentCareerDataRepository, slugify } from "@hire-me-mcp/core";

const baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  console.error("build-config.mjs: BASE_URL is required.");
  process.exit(1);
}
const origin = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

const repository = createContentCareerDataRepository();
const [firstProject] = repository.getDataset().projects;
if (firstProject === undefined) {
  console.error("build-config.mjs: no projects in packages/career-data to build a detail URL for.");
  process.exit(1);
}

const urls = [
  origin,
  `${origin}/projects/${slugify(firstProject.id)}`,
  `${origin}/privacy`,
  `${origin}/cv/print`,
  `${origin}/mcp`,
];

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHeaders = bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {};

const baseConfig = JSON.parse(
  readFileSync(new URL("../../lighthouserc.json", import.meta.url), "utf-8"),
);

const runConfig = {
  ci: {
    ...baseConfig.ci,
    collect: {
      ...baseConfig.ci.collect,
      url: urls,
      settings: {
        ...baseConfig.ci.collect.settings,
        extraHeaders: JSON.stringify(extraHeaders),
      },
    },
  },
};

const outputPath = process.argv[2] ?? ".lighthouserc.local.json";
writeFileSync(outputPath, JSON.stringify(runConfig, null, 2));
// Deliberately no console.log of the config contents — it embeds the
// bypass header when one is configured, and this script must never print
// the secret's value.
console.log(
  `Wrote ${outputPath} for ${urls.length} URLs (bypass header: ${bypassSecret ? "set" : "not set"}).`,
);
