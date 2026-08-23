import { describe, expect, it } from "vitest";
import { AGENT_TOOL_CORE_FUNCTIONS, AGENT_TOOL_NAMES, AGENT_TOOLS } from "./index.js";

describe("AGENT_TOOLS", () => {
  it("registers exactly the five domain-grounded tools, keyed by their tool name", () => {
    expect(Object.keys(AGENT_TOOLS)).toEqual([
      "get-profile",
      "get-experience",
      "search-projects",
      "get-skill-evidence",
      "search-career",
    ]);
  });

  it("every registered tool's own id matches the key it is registered under", () => {
    for (const [name, tool] of Object.entries(AGENT_TOOLS)) {
      expect(tool.id).toBe(name);
    }
  });

  it("exposes AGENT_TOOL_NAMES matching the registered tool set exactly", () => {
    expect(AGENT_TOOL_NAMES).toEqual(Object.keys(AGENT_TOOLS));
  });
});

describe("AGENT_TOOL_CORE_FUNCTIONS", () => {
  it("maps every registered tool name to a core service function reference", () => {
    expect(Object.keys(AGENT_TOOL_CORE_FUNCTIONS).sort()).toEqual([...AGENT_TOOL_NAMES].sort());
    for (const name of AGENT_TOOL_NAMES) {
      expect(typeof AGENT_TOOL_CORE_FUNCTIONS[name]).toBe("function");
    }
  });
});
