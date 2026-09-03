import { describe, expect, it, vi } from "vitest";
import { formatCaseTable, resolveRetrievalEvalEnvConfig, runRetrievalEvalCli } from "./cli.js";
import type { GoldenQuery } from "./dataset/schema.js";
import type { RetrievalReport } from "./report.js";

const PASSING_QUERY: GoldenQuery = {
  id: "exact-typescript",
  query: "does he know typescript",
  category: "exact",
  expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
};

const ABSENT_QUERY: GoldenQuery = {
  id: "absent-blockchain",
  query: "blockchain experience",
  category: "absent-topic",
  expectedSources: [],
  expectEmpty: true,
};

function fakeSearchCareer(
  resultsByQuery: Record<string, Array<{ sourceType: string; sourceId: string; score: number }>>,
) {
  return async (
    text: string,
    options?: { topK?: number; minScore?: number; sourceTypes?: readonly string[] },
  ): Promise<{ results: Array<{ sourceType: string; sourceId: string; score: number }> }> => {
    const results = resultsByQuery[text] ?? [];
    const scoped =
      options?.sourceTypes === undefined
        ? results
        : results.filter((r) => options.sourceTypes?.includes(r.sourceType));
    return { results: scoped };
  };
}

describe("resolveRetrievalEvalEnvConfig", () => {
  it("applies conservative defaults when env is unset", () => {
    const config = resolveRetrievalEvalEnvConfig({});
    expect(config.topK).toBeGreaterThan(0);
    expect(config.absentTopicMinScore).toBeGreaterThan(0);
    expect(config.reportPath.length).toBeGreaterThan(0);
  });

  it("reads EVAL_RETRIEVAL_TOP_K, EVAL_RETRIEVAL_ABSENT_MIN_SCORE, and EVAL_RETRIEVAL_REPORT_PATH from env", () => {
    const config = resolveRetrievalEvalEnvConfig({
      EVAL_RETRIEVAL_TOP_K: "8",
      EVAL_RETRIEVAL_ABSENT_MIN_SCORE: "0.55",
      EVAL_RETRIEVAL_REPORT_PATH: "custom-report.json",
    });
    expect(config).toEqual({
      topK: 8,
      absentTopicMinScore: 0.55,
      reportPath: "custom-report.json",
    });
  });

  it("falls back to defaults for malformed numeric env values", () => {
    const config = resolveRetrievalEvalEnvConfig({
      EVAL_RETRIEVAL_TOP_K: "not-a-number",
      EVAL_RETRIEVAL_ABSENT_MIN_SCORE: "-1",
    });
    const defaults = resolveRetrievalEvalEnvConfig({});
    expect(config.topK).toBe(defaults.topK);
    expect(config.absentTopicMinScore).toBe(defaults.absentTopicMinScore);
  });
});

describe("formatCaseTable", () => {
  it("renders one line per case including its id, category, and pass/fail", () => {
    const report: RetrievalReport = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      topK: 5,
      absentTopicMinScore: 0.4,
      cases: [
        {
          id: "exact-typescript",
          category: "exact",
          query: "does he know typescript",
          expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
          retrieved: [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
          metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
          expectEmptyCheck: null,
          matchMode: "all",
          preferredSource: null,
          matchModePassed: true,
          preferencePassed: null,
          preferredSourceReciprocalRank: null,
          passed: true,
          lanes: {
            unscoped: {
              lane: "unscoped",
              retrievedIds: ["skill:typescript"],
              metrics: { recallAtK: 1, precisionAtK: 1, reciprocalRank: 1 },
            },
            storyScoped: {
              lane: "storyScoped",
              retrievedIds: [],
              metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
            },
          },
        },
      ],
      aggregates: {
        recallAtK: 1,
        precisionAtK: 1,
        mrr: 1,
        absentTopicAccuracy: 1,
        preferredSourceCompliance: 1,
        lanes: {
          unscoped: { recallAtK: 1, precisionAtK: 1, mrr: 1, scoredCases: 1 },
          storyScoped: { recallAtK: 0, precisionAtK: 0, mrr: 0, scoredCases: 0 },
        },
      },
      thresholds: {
        recallAtK: 0.5,
        precisionAtK: 0.2,
        mrr: 0.4,
        absentTopicAccuracy: 0.8,
        preferredSourceCompliance: 0.7,
      },
      verdict: { passed: true, failures: [] },
    };

    const table = formatCaseTable(report);

    expect(table).toContain("exact-typescript");
    expect(table).toContain("exact");
    expect(table).toContain("PASS");
  });

  it("marks a failed case as FAIL, not PASS", () => {
    const report: RetrievalReport = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      topK: 5,
      absentTopicMinScore: 0.4,
      cases: [
        {
          id: "exact-typescript",
          category: "exact",
          query: "does he know typescript",
          expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
          retrieved: [],
          metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
          expectEmptyCheck: null,
          matchMode: "all",
          preferredSource: null,
          matchModePassed: false,
          preferencePassed: null,
          preferredSourceReciprocalRank: null,
          passed: false,
          lanes: {
            unscoped: {
              lane: "unscoped",
              retrievedIds: [],
              metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
            },
            storyScoped: {
              lane: "storyScoped",
              retrievedIds: [],
              metrics: { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
            },
          },
        },
      ],
      aggregates: {
        recallAtK: 0,
        precisionAtK: 0,
        mrr: 0,
        absentTopicAccuracy: 1,
        preferredSourceCompliance: 1,
        lanes: {
          unscoped: { recallAtK: 0, precisionAtK: 0, mrr: 0, scoredCases: 1 },
          storyScoped: { recallAtK: 0, precisionAtK: 0, mrr: 0, scoredCases: 1 },
        },
      },
      thresholds: {
        recallAtK: 0.5,
        precisionAtK: 0.2,
        mrr: 0.4,
        absentTopicAccuracy: 0.8,
        preferredSourceCompliance: 0.7,
      },
      verdict: {
        passed: false,
        failures: ["recall@k aggregate 0.0000 is below its threshold 0.5000"],
      },
    };

    const table = formatCaseTable(report);

    expect(table).toContain("FAIL");
    expect(table).not.toContain("PASS");
  });
});

describe("runRetrievalEvalCli: retrieval lanes (#307)", () => {
  it("logs the unscoped and story-scoped lane aggregates alongside the top-level recall/precision/MRR", async () => {
    const writeFile = vi.fn(async () => undefined);
    const log = vi.fn();

    await runRetrievalEvalCli(
      {
        queries: [PASSING_QUERY],
        envConfig: { topK: 5, absentTopicMinScore: 0.4, reportPath: "out.json" },
      },
      {
        searchCareer: fakeSearchCareer({
          "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
        }),
        writeFile,
        log,
      },
    );

    const logged = log.mock.calls.map((call) => call[0] as string).join("\n");
    expect(logged).toContain("unscoped");
    expect(logged).toContain("storyScoped");
  });
});

describe("runRetrievalEvalCli: preferredSourceCompliance (#295)", () => {
  it("logs the preferredSourceCompliance aggregate alongside recall/precision/MRR/absent-topic", async () => {
    const writeFile = vi.fn(async () => undefined);
    const log = vi.fn();

    await runRetrievalEvalCli(
      {
        queries: [PASSING_QUERY],
        envConfig: { topK: 5, absentTopicMinScore: 0.4, reportPath: "out.json" },
      },
      {
        searchCareer: fakeSearchCareer({
          "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
        }),
        writeFile,
        log,
      },
    );

    const logged = log.mock.calls.map((call) => call[0] as string).join("\n");
    expect(logged).toContain("preferred-source compliance");
  });
});

describe("runRetrievalEvalCli", () => {
  it("exits 0 and writes the report when the run meets every threshold", async () => {
    const writeFile = vi.fn(async (_path: string, _contents: string) => undefined);
    const log = vi.fn();

    const exitCode = await runRetrievalEvalCli(
      {
        queries: [PASSING_QUERY, ABSENT_QUERY],
        envConfig: { topK: 5, absentTopicMinScore: 0.4, reportPath: "out.json" },
        thresholds: {
          recallAtK: 0.5,
          precisionAtK: 0.5,
          mrr: 0.5,
          absentTopicAccuracy: 0.5,
          preferredSourceCompliance: 0.5,
        },
      },
      {
        searchCareer: fakeSearchCareer({
          "does he know typescript": [{ sourceType: "skill", sourceId: "typescript", score: 0.9 }],
          "blockchain experience": [],
        }),
        writeFile,
        log,
      },
    );

    expect(exitCode).toBe(0);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]?.[0]).toBe("out.json");
  });

  it("exits non-zero when the run misses a threshold, but still writes the report", async () => {
    const writeFile = vi.fn(async () => undefined);
    const log = vi.fn();

    const exitCode = await runRetrievalEvalCli(
      {
        queries: [PASSING_QUERY],
        envConfig: { topK: 5, absentTopicMinScore: 0.4, reportPath: "out.json" },
        thresholds: {
          recallAtK: 1,
          precisionAtK: 1,
          mrr: 1,
          absentTopicAccuracy: 1,
          preferredSourceCompliance: 1,
        },
      },
      {
        searchCareer: fakeSearchCareer({
          "does he know typescript": [{ sourceType: "skill", sourceId: "rust", score: 0.9 }],
        }),
        writeFile,
        log,
      },
    );

    expect(exitCode).toBe(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });
});
