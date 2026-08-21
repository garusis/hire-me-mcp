import { describe, expect, it } from "vitest";
import { extractCitationsFromToolResults, resolveRunnerEnvConfig } from "./cli.js";

describe("resolveRunnerEnvConfig", () => {
  it("falls back to conservative defaults when env is empty", () => {
    const config = resolveRunnerEnvConfig({});
    expect(config.maxCases).toBeGreaterThan(0);
    expect(config.maxTotalTokens).toBeGreaterThan(0);
    expect(config.maxCostUsd).toBeGreaterThan(0);
    expect(config.rpmLimit).toBeGreaterThan(0);
    expect(config.reportPath.length).toBeGreaterThan(0);
  });

  it("reads every override from env", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_MAX_CASES: "3",
      EVAL_MAX_TOTAL_TOKENS: "1000",
      EVAL_MAX_COST_USD: "0.02",
      EVAL_RPM_LIMIT: "5",
      EVAL_REPORT_PATH: "custom-report.json",
    });
    expect(config).toEqual({
      maxCases: 3,
      maxTotalTokens: 1000,
      maxCostUsd: 0.02,
      rpmLimit: 5,
      reportPath: "custom-report.json",
    });
  });

  it("ignores a non-numeric override and falls back to the default", () => {
    const config = resolveRunnerEnvConfig({ EVAL_MAX_CASES: "not-a-number" });
    expect(config.maxCases).toBeGreaterThan(0);
  });
});

describe("extractCitationsFromToolResults", () => {
  it("flattens citations off every tool result's DomainResult payload", () => {
    const toolResults = [
      {
        payload: {
          result: {
            data: {},
            citations: [{ entityType: "skill", entityId: "aws", label: "AWS" }],
          },
        },
      },
      {
        payload: {
          result: {
            data: {},
            citations: [{ entityType: "experience", entityId: "house-numbers", label: "HN" }],
          },
        },
      },
    ];

    const citations = extractCitationsFromToolResults(toolResults);
    expect(citations).toEqual([
      { entityType: "skill", entityId: "aws" },
      { entityType: "experience", entityId: "house-numbers" },
    ]);
  });

  it("skips a malformed tool result without throwing", () => {
    const toolResults = [{ payload: { result: null } }, { garbage: true }, undefined];
    expect(() => extractCitationsFromToolResults(toolResults)).not.toThrow();
    expect(extractCitationsFromToolResults(toolResults)).toEqual([]);
  });
});
