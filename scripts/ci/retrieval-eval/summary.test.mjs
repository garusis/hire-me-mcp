/**
 * #52 — unit tests for the pure retrieval-eval job-summary renderer.
 * Plain `node --test`, same convention as `scripts/ci/docs-rot/*.test.mjs`.
 * Run: `node --test scripts/ci/retrieval-eval/summary.test.mjs`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSummaryMarkdown } from "./summary.mjs";

function reportFixture(overrides = {}) {
  return {
    generatedAt: "2026-08-20T00:00:00.000Z",
    topK: 5,
    absentTopicMinScore: 0.3,
    cases: [{ id: "a" }, { id: "b" }],
    aggregates: {
      recallAtK: 0.75,
      precisionAtK: 0.3,
      mrr: 0.6,
      absentTopicAccuracy: 1,
    },
    thresholds: {
      recallAtK: 0.5,
      precisionAtK: 0.2,
      mrr: 0.4,
      absentTopicAccuracy: 0.8,
    },
    verdict: { passed: true, failures: [] },
    ...overrides,
  };
}

test("buildSummaryMarkdown renders every aggregate metric with its threshold and a pass mark", () => {
  const markdown = buildSummaryMarkdown(reportFixture());

  assert.match(markdown, /## Retrieval eval report/);
  assert.match(markdown, /recall@k \| 75\.0% \| 50\.0% \| ✅/);
  assert.match(markdown, /precision@k \| 30\.0% \| 20\.0% \| ✅/);
  assert.match(markdown, /MRR \| 60\.0% \| 40\.0% \| ✅/);
  assert.match(markdown, /absent-topic accuracy \| 100\.0% \| 80\.0% \| ✅/);
});

test("buildSummaryMarkdown reports a passing verdict when every metric clears its threshold", () => {
  const markdown = buildSummaryMarkdown(reportFixture());
  assert.match(markdown, /\*\*Verdict: PASSED\*\*/);
});

test("buildSummaryMarkdown reports a failing verdict with each breach listed, and a ❌ mark on the failing row", () => {
  const report = reportFixture({
    aggregates: { recallAtK: 0.1, precisionAtK: 0.3, mrr: 0.6, absentTopicAccuracy: 1 },
    verdict: {
      passed: false,
      failures: ["recall@k aggregate 0.1000 is below its threshold 0.5000"],
    },
  });

  const markdown = buildSummaryMarkdown(report);

  assert.match(markdown, /\*\*Verdict: FAILED\*\* — 1 threshold breach\(es\):/);
  assert.match(markdown, /recall@k aggregate 0\.1000 is below its threshold 0\.5000/);
  assert.match(markdown, /recall@k \| 10\.0% \| 50\.0% \| ❌/);
});

test("buildSummaryMarkdown includes generatedAt, topK and the case count", () => {
  const markdown = buildSummaryMarkdown(reportFixture());
  assert.match(markdown, /Generated 2026-08-20T00:00:00\.000Z, topK=5, 2 golden case\(s\)\./);
});
