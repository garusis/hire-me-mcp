import { describe, expect, it } from "vitest";
import { MCP_TOOL_CATALOGUE } from "./tool-catalogue";
import { EXPECTED_TOOL_NAMES } from "./tool-names";
import { getExperienceTool } from "./tools/get-experience";
import { getProfileTool } from "./tools/get-profile";
import { getSkillEvidenceTool } from "./tools/get-skill-evidence";
import { listRecommendationsTool } from "./tools/list-recommendations";
import { pingTool } from "./tools/ping";
import { searchCareerTool } from "./tools/search-career";
import { searchProjectsTool } from "./tools/search-projects";

const REAL_TOOLS_BY_NAME = new Map(
  [
    pingTool,
    getProfileTool,
    getExperienceTool,
    searchProjectsTool,
    getSkillEvidenceTool,
    searchCareerTool,
    listRecommendationsTool,
  ].map((tool) => [tool.name, tool]),
);

describe("MCP_TOOL_CATALOGUE (#43)", () => {
  it("has exactly one entry per tool name in EXPECTED_TOOL_NAMES — the single source of truth also asserted against the live server in route.test.ts — in the same order", () => {
    expect(MCP_TOOL_CATALOGUE.map((entry) => entry.name)).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it("copies each entry's description verbatim from the actual registered tool definition, never a hand-authored duplicate", () => {
    for (const entry of MCP_TOOL_CATALOGUE) {
      const realTool = REAL_TOOLS_BY_NAME.get(entry.name);
      expect(realTool).toBeDefined();
      expect(entry.description).toBe(realTool?.description);
    }
  });

  it("gives every tool a non-empty example prompt a visitor could paste into their assistant", () => {
    for (const entry of MCP_TOOL_CATALOGUE) {
      expect(entry.examplePrompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not list any tool absent from the real registry", () => {
    for (const entry of MCP_TOOL_CATALOGUE) {
      expect(REAL_TOOLS_BY_NAME.has(entry.name)).toBe(true);
    }
  });
});
