/**
 * Renders a retrieval eval run's machine-readable report
 * (`packages/core/src/eval-retrieval/report.ts`, written by
 * `pnpm eval:retrieval` to `packages/core/retrieval-eval-report.json`) as a
 * Markdown table of aggregate metrics vs. their committed thresholds, plus
 * the pass/fail verdict — printed to stdout and, in CI, appended to
 * `$GITHUB_STEP_SUMMARY` (#52's "aggregate metrics appear in the job
 * summary" acceptance criterion). Same shape/purpose as
 * `scripts/ci/eval-summary.mjs` (the agent-evals equivalent), kept as a
 * separate script because the two reports have unrelated field shapes
 * (`RetrievalReport` vs. the agent eval's per-scorer report).
 *
 * `buildSummaryMarkdown` is pure (no I/O) so it's unit-testable without a
 * real report file — see `summary.test.mjs`. `main()` is the thin CLI
 * wrapper that reads the report path from argv, reads/parses the file, and
 * writes stdout + `$GITHUB_STEP_SUMMARY`.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";

const pct = (value) => `${(value * 100).toFixed(1)}%`;

/**
 * Builds the Markdown job-summary body for a `RetrievalReport`-shaped
 * object. Pure — takes the already-parsed report, returns a string.
 */
export function buildSummaryMarkdown(report) {
  const rows = [
    ["recall@k", report.aggregates.recallAtK, report.thresholds.recallAtK],
    ["precision@k", report.aggregates.precisionAtK, report.thresholds.precisionAtK],
    ["MRR", report.aggregates.mrr, report.thresholds.mrr],
    [
      "absent-topic accuracy",
      report.aggregates.absentTopicAccuracy,
      report.thresholds.absentTopicAccuracy,
    ],
  ]
    .map(([label, actual, threshold]) => {
      const passed = actual >= threshold;
      return `| ${label} | ${pct(actual)} | ${pct(threshold)} | ${passed ? "✅" : "❌"} |`;
    })
    .join("\n");

  const verdictLine = report.verdict.passed
    ? "**Verdict: PASSED** — every aggregate metric met its threshold."
    : `**Verdict: FAILED** — ${report.verdict.failures.length} threshold breach(es):\n\n${report.verdict.failures.map((f) => `- ${f}`).join("\n")}`;

  return `## Retrieval eval report

Generated ${report.generatedAt}, topK=${report.topK}, ${report.cases.length} golden case(s).

| Metric | Aggregate | Threshold | Pass |
| --- | ---: | ---: | :---: |
${rows}

${verdictLine}
`;
}

function main() {
  const reportPath = process.argv[2] ?? "packages/core/retrieval-eval-report.json";

  if (!existsSync(reportPath)) {
    console.log(
      `No retrieval eval report found at ${reportPath} — the eval run did not produce one (see the previous step's log).`,
    );
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8"));
  const summary = buildSummaryMarkdown(report);

  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
