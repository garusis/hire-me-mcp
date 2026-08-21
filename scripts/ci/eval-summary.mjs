#!/usr/bin/env node
/**
 * Summarizes an agent eval run's machine-readable report (#72's
 * `packages/agent/src/evals/report.ts`, written by `pnpm eval:agent` to
 * `EVAL_REPORT_PATH`) as a Markdown table — per-scorer aggregates, the
 * pass/fail verdict, and token/cost totals — printed to stdout and, in CI,
 * appended to `$GITHUB_STEP_SUMMARY` (#73's "job summary shows per-scorer
 * aggregates and the pass/fail verdict so a regression is readable without
 * downloading anything" requirement). Runs with `if: always()` in the
 * workflow so a threshold-failing (non-zero exit) run still renders a
 * summary rather than being skipped because the previous step failed —
 * mirrors `scripts/lighthouse/print-scores.mjs`'s same pattern.
 *
 * Reads a report path from argv[2], defaulting to `eval-report.json` (the
 * eval CLI's own default, resolved relative to `packages/agent` since
 * that's where `pnpm eval:agent` runs).
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";

const reportPath = process.argv[2] ?? "packages/agent/eval-report.json";

if (!existsSync(reportPath)) {
  console.log(
    `No eval report found at ${reportPath} — the eval run did not produce one (see the previous step's log).`,
  );
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf-8"));

const pct = (value) => `${(value * 100).toFixed(1)}%`;

const scorerRows = [
  ["groundedness", report.aggregates.groundedness, report.thresholds.groundedness],
  ["gap honesty", report.aggregates.gapHonesty, report.thresholds.gapHonesty],
  ["relevance", report.aggregates.relevance, report.thresholds.relevance],
]
  .map(([label, aggregate, threshold]) => {
    const passed = aggregate.mean >= threshold;
    return `| ${label} | ${pct(aggregate.mean)} | ${pct(threshold)} | ${aggregate.count} | ${passed ? "✅" : "❌"} |`;
  })
  .join("\n");

const verdictLine = report.verdict.passed
  ? "**Verdict: PASSED** — every scorer aggregate met its threshold."
  : `**Verdict: FAILED** — ${report.verdict.failures.length} threshold breach(es):\n\n${report.verdict.failures.map((f) => `- ${f}`).join("\n")}`;

const summary = `## Agent eval report

Model \`${report.modelId}\`, prompt version \`${report.promptVersion}\`, generated ${report.generatedAt}.

| Scorer | Aggregate | Threshold | Cases | Pass |
| --- | ---: | ---: | ---: | :---: |
${scorerRows}

${verdictLine}

**Totals:** ${report.totals.cases} case(s) run, ${report.totals.totalTokens.toLocaleString()} total tokens (${report.totals.inputTokens.toLocaleString()} in / ${report.totals.outputTokens.toLocaleString()} out), estimated cost $${report.totals.costUsd.toFixed(4)}.
`;

console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
}
