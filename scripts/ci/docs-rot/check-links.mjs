#!/usr/bin/env node
/**
 * #59 — link checker: every Markdown file in the repo, plus every page of
 * the deployed site (crawled from `/`, seeded with `/llms.txt`'s own
 * links). Fails on 4xx/5xx, except hosts in `ignore-list.json` (a
 * documented, reviewed exemption for known-flaky/rate-limiting hosts —
 * still checked and logged, just not fatal).
 *
 * Deliberately a SEPARATE job/script from `check-snippets.mjs` (issue AC:
 * "External-link failures and snippet failures are separate jobs, so one
 * cannot mask the other") — this script never touches the MCP protocol,
 * and vice versa.
 *
 * Runnable locally against any deployment with a single command:
 *
 *   node scripts/ci/docs-rot/check-links.mjs --target-url=https://hire-me-mcp-web.vercel.app
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bypassHeaders } from "./lib/bypass.mjs";
import { checkUrlsConcurrently } from "./lib/check-url.mjs";
import { crawlSite } from "./lib/crawl-site.mjs";
import { extractMarkdownLinks, findMarkdownFiles } from "./lib/link-extraction.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

function parseTargetUrl(argv, env) {
  const flag = argv.find((arg) => arg.startsWith("--target-url="));
  const raw = flag ? flag.slice("--target-url=".length) : env.TARGET_URL;
  if (!raw) {
    throw new Error(
      "No target URL given. Pass --target-url=<url> or set TARGET_URL, e.g.:\n" +
        "  node scripts/ci/docs-rot/check-links.mjs --target-url=https://hire-me-mcp-web.vercel.app",
    );
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function loadIgnoreHosts() {
  const raw = readFileSync(resolve(import.meta.dirname, "ignore-list.json"), "utf-8");
  return new Set(JSON.parse(raw).hosts.map((entry) => entry.host));
}

function collectMarkdownLinks(sources) {
  const linkToFiles = new Map();
  for (const filePath of findMarkdownFiles(REPO_ROOT)) {
    const text = readFileSync(filePath, "utf-8");
    for (const link of extractMarkdownLinks(text)) {
      const relativePath = filePath.replace(`${REPO_ROOT}/`, "");
      if (!linkToFiles.has(link)) linkToFiles.set(link, []);
      linkToFiles.get(link).push(relativePath);
      sources.set(link, [...(sources.get(link) ?? []), relativePath]);
    }
  }
  return linkToFiles;
}

// /api/mcp is a POST-only JSON-RPC endpoint, not a browsable page — a
// HEAD/GET probe correctly 405s even though the endpoint is healthy.
// check-snippets.mjs already verifies it thoroughly with real JSON-RPC
// calls; the link checker excludes it rather than reporting a false
// "broken link" for a working, non-browsable API route.
function excludeApiMcpRoute(sources) {
  for (const url of sources.keys()) {
    if (new URL(url).pathname === "/api/mcp") {
      sources.delete(url);
    }
  }
}

/**
 * Checks every URL, applying the Vercel bypass header only to same-origin
 * (internal) URLs — done as a second pass over just the internal subset
 * rather than branching per-URL, so external hosts are never sent a
 * Vercel-specific header.
 */
async function checkAllUrls(allUrls, targetUrl, headers) {
  const results = await checkUrlsConcurrently(allUrls, { headers: {} }, 6);
  if (Object.keys(headers).length === 0) {
    return results;
  }
  const internalIndices = allUrls
    .map((url, i) => (url.startsWith(targetUrl) ? i : -1))
    .filter((i) => i >= 0);
  if (internalIndices.length === 0) {
    return results;
  }
  const internalResults = await checkUrlsConcurrently(
    internalIndices.map((i) => allUrls[i]),
    { headers },
    6,
  );
  internalIndices.forEach((originalIndex, j) => {
    results[originalIndex] = internalResults[j];
  });
  return results;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Splits check results into fatal failures and non-fatal (ignore-listed host) warnings. */
function classifyResults(allUrls, results, sources, ignoreHosts) {
  const failures = [];
  const warnings = [];
  for (let i = 0; i < allUrls.length; i++) {
    const result = results[i];
    if (result.ok) continue;
    const url = allUrls[i];
    const provenance = sources.get(url)?.join(", ") ?? "unknown";
    const message = `${url} -> ${result.status ?? "ERROR"}${result.error ? ` (${result.error})` : ""} [linked from: ${provenance}]`;
    (ignoreHosts.has(safeHost(url)) ? warnings : failures).push(message);
  }
  return { failures, warnings };
}

function report(allUrls, failures, warnings) {
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s) against ignore-listed hosts (not fatal):`);
    for (const warning of warnings) console.log(`  - (ignored host) ${warning}`);
  }
  if (failures.length === 0) {
    console.log(`\nAll ${allUrls.length} link(s) resolved successfully.`);
    return;
  }
  console.error(`\n${failures.length} broken link(s) found:\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exitCode = 1;
}

async function main() {
  const targetUrl = parseTargetUrl(process.argv.slice(2), process.env);
  const headers = bypassHeaders(process.env);
  const ignoreHosts = loadIgnoreHosts();

  console.log(`docs-rot link check — target deployment: ${targetUrl}`);
  console.log(`Ignore list: ${ignoreHosts.size === 0 ? "(empty)" : [...ignoreHosts].join(", ")}`);

  const sources = new Map(); // link -> [provenance strings], for actionable failure messages

  console.log("\nCollecting links from repo Markdown...");
  collectMarkdownLinks(sources);

  console.log(`Crawling ${targetUrl} (from / and /llms.txt)...`);
  const { pages, links: crawledLinks } = await crawlSite(targetUrl, { headers });
  console.log(`Crawled ${pages.length} same-origin page(s).`);
  for (const link of crawledLinks) {
    sources.set(link, [...(sources.get(link) ?? []), `deployed site crawl (from ${targetUrl})`]);
  }

  excludeApiMcpRoute(sources);

  const allUrls = [...sources.keys()];
  console.log(`\nChecking ${allUrls.length} unique link(s)...`);

  const results = await checkAllUrls(allUrls, targetUrl, headers);
  const { failures, warnings } = classifyResults(allUrls, results, sources, ignoreHosts);
  report(allUrls, failures, warnings);
}

main().catch((error) => {
  console.error(`docs-rot link check crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
