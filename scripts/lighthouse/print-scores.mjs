#!/usr/bin/env node
/**
 * Summarizes the Lighthouse gate's category scores (#58) from
 * `.lighthouseci/manifest.json` (written by `lhci autorun` — see
 * `lighthouserc.json`'s `upload.outputDir`) as a Markdown table, printed to
 * stdout and, in CI, appended to `$GITHUB_STEP_SUMMARY` so scores are
 * visible on the workflow run — the source `apps/web/README.md#preview-gates`
 * points readers at, and what a PR description quotes when recording scores
 * per issue #58's acceptance criteria. Runs regardless of whether the
 * assertion step passed or failed (`if: always()` in the workflow), so a
 * failing run still shows exactly which category/URL missed the bar.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";

const manifestPath = ".lighthouseci/manifest.json";
if (!existsSync(manifestPath)) {
  console.log(
    "No .lighthouseci/manifest.json found — Lighthouse did not run (see the collect step's log).",
  );
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const rows = manifest.map((entry) => {
  const lhr = JSON.parse(readFileSync(entry.jsonPath, "utf-8"));
  const pct = (score) =>
    score === null || score === undefined ? "n/a" : `${Math.round(score * 100)}`;
  return {
    url: entry.url,
    performance: pct(lhr.categories.performance.score),
    accessibility: pct(lhr.categories.accessibility.score),
    "best-practices": pct(lhr.categories["best-practices"].score),
    seo: pct(lhr.categories.seo.score),
  };
});

const header = "| URL | Performance | Accessibility | Best Practices | SEO* |";
const separator = "| --- | --- | --- | --- | --- |";
const body = rows
  .map(
    (row) =>
      `| ${row.url} | ${row.performance} | ${row.accessibility} | ${row["best-practices"]} | ${row.seo} |`,
  )
  .join("\n");
const footnote =
  "\n\\* SEO's aggregate category score always shows below 100 against a preview URL — every preview deploy " +
  "intentionally sets `noindex` (see `apps/web/src/lib/config/site-url.ts#getRobotsIndexable`), which the " +
  "`is-crawlable` audit correctly flags. The gate itself (`lighthouserc.json`) asserts every other SEO audit " +
  "individually instead of the aggregate score, so a real SEO regression still fails the build.";

const table = `${header}\n${separator}\n${body}${footnote}\n`;
console.log(table);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Lighthouse scores\n\n${table}\n`);
}
