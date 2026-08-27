import { describe, expect, it } from "vitest";
import {
  extractCitationsFromToolResults,
  extractToolNamesFromToolResults,
  filterCasesByIds,
  resolveRunnerEnvConfig,
} from "./cli.js";
import type { EvalCase } from "./dataset/schema.js";
import { DEFAULT_EVAL_RPM_LIMIT, FREE_TIER_RPM_CEILING } from "./rate-limit.js";

describe("resolveRunnerEnvConfig", () => {
  it("falls back to conservative defaults when env is empty", () => {
    const config = resolveRunnerEnvConfig({});
    expect(config.maxCases).toBeGreaterThan(0);
    expect(config.maxTotalTokens).toBeGreaterThan(0);
    expect(config.maxCostUsd).toBeGreaterThan(0);
    expect(config.rpmLimit).toBeGreaterThan(0);
    expect(config.reportPath.length).toBeGreaterThan(0);
    expect(config.caseIds).toBeUndefined();
  });

  it("reads every override from env", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_MAX_CASES: "3",
      EVAL_MAX_TOTAL_TOKENS: "1000",
      EVAL_MAX_COST_USD: "0.02",
      EVAL_RPM_LIMIT: "5",
      EVAL_REPORT_PATH: "custom-report.json",
      EVAL_CASE_IDS: "grounded-nodejs-experience,gap-golang",
    });
    expect(config).toEqual({
      maxCases: 3,
      maxTotalTokens: 1000,
      maxCostUsd: 0.02,
      rpmLimit: 5,
      reportPath: "custom-report.json",
      caseIds: ["grounded-nodejs-experience", "gap-golang"],
    });
  });

  it("takes EVAL_RPM_LIMIT's default from the single documented quota source, not a literal (#282)", () => {
    // The limiter, this config and the README quota table all read the same
    // constant, so they cannot drift apart.
    expect(resolveRunnerEnvConfig({}).rpmLimit).toBe(DEFAULT_EVAL_RPM_LIMIT);
    expect(DEFAULT_EVAL_RPM_LIMIT).toBeLessThan(FREE_TIER_RPM_CEILING);
  });

  it("ignores a non-numeric override and falls back to the default", () => {
    const config = resolveRunnerEnvConfig({ EVAL_MAX_CASES: "not-a-number" });
    expect(config.maxCases).toBeGreaterThan(0);
  });

  it("trims whitespace and drops empty entries from EVAL_CASE_IDS", () => {
    const config = resolveRunnerEnvConfig({
      EVAL_CASE_IDS: " grounded-nodejs-experience , , gap-golang ,",
    });
    expect(config.caseIds).toEqual(["grounded-nodejs-experience", "gap-golang"]);
  });

  it("leaves caseIds undefined when EVAL_CASE_IDS is unset or blank", () => {
    expect(resolveRunnerEnvConfig({}).caseIds).toBeUndefined();
    expect(resolveRunnerEnvConfig({ EVAL_CASE_IDS: "   " }).caseIds).toBeUndefined();
  });
});

describe("filterCasesByIds", () => {
  const cases: readonly EvalCase[] = [
    {
      id: "grounded-nodejs-experience",
      category: "grounded",
      question: "What is his experience with Node.js?",
      gapHonestyDirection: "claimed",
    },
    {
      id: "gap-golang",
      category: "gap",
      question: "Does he have production Go (Golang) experience?",
      gapHonestyDirection: "gap",
    },
  ];

  it("returns every case unchanged when no filter is given", () => {
    expect(filterCasesByIds(cases, undefined)).toEqual(cases);
  });

  it("keeps only the cases whose id is in the filter, in dataset order", () => {
    const filtered = filterCasesByIds(cases, ["gap-golang", "grounded-nodejs-experience"]);
    expect(filtered.map((c) => c.id)).toEqual(["grounded-nodejs-experience", "gap-golang"]);
  });

  it("throws a clear error when a requested id does not exist in the dataset", () => {
    expect(() => filterCasesByIds(cases, ["not-a-real-case"])).toThrow(
      /unknown eval case id.*not-a-real-case/i,
    );
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

describe("extractToolNamesFromToolResults (#75)", () => {
  it("collects every tool result's payload.toolName (the real ToolResultChunk shape), in order, including duplicates", () => {
    const toolResults = [
      {
        type: "tool-result",
        payload: { toolName: "get-experience", result: { data: [], citations: [] } },
      },
      {
        type: "tool-result",
        payload: { toolName: "search-career", result: { data: {}, citations: [] } },
      },
      {
        type: "tool-result",
        payload: { toolName: "search-career", result: { data: {}, citations: [] } },
      },
    ];

    expect(extractToolNamesFromToolResults(toolResults)).toEqual([
      "get-experience",
      "search-career",
      "search-career",
    ]);
  });

  it("falls back to a top-level toolName when there is no payload one", () => {
    const toolResults = [
      { toolName: "flat-shape" },
      { toolName: "top-level-ignored", payload: { toolName: "payload-wins" } },
    ];
    expect(extractToolNamesFromToolResults(toolResults)).toEqual(["flat-shape", "payload-wins"]);
  });

  it("returns an empty array for no tool calls", () => {
    expect(extractToolNamesFromToolResults([])).toEqual([]);
  });

  it("skips a tool result with no string toolName anywhere, without throwing", () => {
    const toolResults = [
      { payload: { toolName: 42 } },
      { garbage: true },
      undefined,
      { payload: { toolName: "real" } },
    ];
    expect(() => extractToolNamesFromToolResults(toolResults)).not.toThrow();
    expect(extractToolNamesFromToolResults(toolResults)).toEqual(["real"]);
  });
});
