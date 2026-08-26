/**
 * Drift-detecting architecture test for #64: the interview agent's tool set
 * (`@hire-me-mcp/agent`) and this MCP server's tool set must resolve every
 * shared tool name to the *exact same* `@hire-me-mcp/core` domain function —
 * not two independently-written implementations that happen to agree today.
 *
 * Mechanism: `@hire-me-mcp/core`'s domain functions are replaced with
 * per-tool sentinel spies that each return a distinctive fixture
 * `DomainResult` no real content could produce. Both surfaces are then
 * driven with equivalent valid input:
 *
 * - If either surface called anything other than the shared, mocked core
 *   function (a private reimplementation, a different core export, stale
 *   real content), its output would not equal that tool's fixture sentinel
 *   and the assertion fails.
 * - If either surface pointed at the *wrong* tool's core function, the
 *   `toHaveBeenCalledTimes(1)` assertions on the sentinels catch it (one
 *   spy called zero or two times instead of exactly once).
 *
 * This is the fixture-based demonstration the issue's acceptance criteria
 * ask for: swap either surface's wiring to point at a divergent
 * implementation and this suite goes red.
 */

import { AGENT_TOOL_CORE_FUNCTIONS, AGENT_TOOLS } from "@hire-me-mcp/agent";
import type { DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOL_EXECUTORS } from "./tool-core-parity";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return {
    ...actual,
    getProfile: vi.fn(),
    getExperience: vi.fn(),
    searchProjects: vi.fn(),
    getSkillEvidence: vi.fn(),
    listRecommendations: vi.fn(),
  };
});
vi.mock("../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(() => ({ getDataset: vi.fn() })),
}));

interface Case {
  name: keyof typeof MCP_TOOL_EXECUTORS;
  input: Record<string, unknown>;
  coreFnName: string;
  getCoreFn: () => (...args: unknown[]) => unknown;
  sentinel: DomainResult<unknown>;
}

const cases: Case[] = [
  {
    name: "get-profile",
    input: {},
    coreFnName: "getProfile",
    getCoreFn: () => core.getProfile as unknown as (...args: unknown[]) => unknown,
    sentinel: {
      data: { sentinel: "get-profile-fixture" },
      citations: [{ entityType: "profile", entityId: "sentinel-profile", label: "Sentinel" }],
    },
  },
  {
    name: "get-experience",
    input: {},
    coreFnName: "getExperience",
    getCoreFn: () => core.getExperience as unknown as (...args: unknown[]) => unknown,
    sentinel: {
      data: [{ sentinel: "get-experience-fixture" }],
      citations: [{ entityType: "experience", entityId: "sentinel-role", label: "Sentinel" }],
    },
  },
  {
    name: "search-projects",
    input: { query: "sentinel" },
    coreFnName: "searchProjects",
    getCoreFn: () => core.searchProjects as unknown as (...args: unknown[]) => unknown,
    sentinel: {
      data: [{ sentinel: "search-projects-fixture" }],
      citations: [{ entityType: "project", entityId: "sentinel-project", label: "Sentinel" }],
    },
  },
  {
    name: "get-skill-evidence",
    input: { term: "sentinel" },
    coreFnName: "getSkillEvidence",
    getCoreFn: () => core.getSkillEvidence as unknown as (...args: unknown[]) => unknown,
    sentinel: {
      data: { kind: "unknown", term: "sentinel-fixture" },
      citations: [],
    },
  },
  {
    name: "list-recommendations",
    input: {},
    coreFnName: "listRecommendations",
    getCoreFn: () => core.listRecommendations as unknown as (...args: unknown[]) => unknown,
    sentinel: {
      data: [{ sentinel: "list-recommendations-fixture" }],
      citations: [
        {
          entityType: "recommendation",
          entityId: "sentinel-recommendation",
          label: "Sentinel",
        },
      ],
    },
  },
];

describe("MCP tool set and agent tool set share one core-function source of truth (#64)", () => {
  beforeEach(() => {
    for (const { getCoreFn } of cases) {
      vi.mocked(getCoreFn()).mockReset();
    }
  });

  it.each(cases)(
    "$name: MCP executor and agent tool both delegate to the same core.$coreFnName — never to a divergent implementation",
    async ({ name, input, getCoreFn, sentinel }) => {
      const spy = vi.mocked(getCoreFn());
      spy.mockReturnValue(sentinel);

      const mcpResult = await MCP_TOOL_EXECUTORS[name](input);
      const agentTool = AGENT_TOOLS[name];
      if (!agentTool?.execute) {
        throw new Error(`agent tool "${name}" has no execute function`);
      }
      const agentResult = await agentTool.execute(input, {} as never);

      // Called once per surface, against the one shared mocked function —
      // never zero (a divergent implementation was called instead) and
      // never more than twice total (no surface calling it twice itself).
      expect(spy).toHaveBeenCalledTimes(2);

      expect(mcpResult.isError).toBeUndefined();
      expect(mcpResult.structuredContent).toEqual({
        data: sentinel.data,
        citations: sentinel.citations,
      });
      expect(agentResult).toEqual(sentinel);

      // The registry's declared core-function reference is the literal
      // function this test just mocked — not a lookalike re-import.
      expect(AGENT_TOOL_CORE_FUNCTIONS[name]).toBe(getCoreFn());
    },
  );

  it("covers every tool name the MCP surface registers (no silently-skipped tool)", () => {
    expect(Object.keys(MCP_TOOL_EXECUTORS).sort()).toEqual(cases.map((c) => c.name).sort());
  });

  it("the agent tool set is a superset of the MCP tool set — every MCP tool has an agent counterpart", () => {
    // Not exact equality (#75, epic #6): the agent gained a fifth tool,
    // `search-career` (a live semantic-retrieval query, not a
    // CareerDataRepository read), that the MCP server does not register
    // yet — that's #61's job, tracked separately and explicitly out of
    // #75's scope. This still catches the drift this suite exists to
    // catch: an MCP tool silently missing from the agent's tool set.
    const mcpToolNames = Object.keys(MCP_TOOL_EXECUTORS);
    const agentToolNames = new Set(Object.keys(AGENT_TOOLS));
    for (const name of mcpToolNames) {
      expect(agentToolNames.has(name)).toBe(true);
    }
  });
});
