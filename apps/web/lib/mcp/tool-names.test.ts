import { describe, expect, it } from "vitest";
import { EXPECTED_TOOL_NAMES } from "./tool-names.js";

describe("EXPECTED_TOOL_NAMES", () => {
  it("lists exactly the eleven career tools plus ping, with no duplicates (#61 adds search-career; #211-#215 add the list tools)", () => {
    expect(EXPECTED_TOOL_NAMES).toEqual([
      "ping",
      "get-profile",
      "get-experience",
      "search-projects",
      "get-skill-evidence",
      "search-career",
      "list-education",
      "list-skills",
      "list-gaps",
      "list-projects",
      "list-writing",
      "list-recommendations",
    ]);
    expect(new Set(EXPECTED_TOOL_NAMES).size).toBe(EXPECTED_TOOL_NAMES.length);
  });

  it("includes search-career (#61), the server's semantic-retrieval tool", () => {
    expect(EXPECTED_TOOL_NAMES).toContain("search-career");
  });

  it("has no duplicate names", () => {
    expect(new Set(EXPECTED_TOOL_NAMES).size).toBe(EXPECTED_TOOL_NAMES.length);
  });

  it("is kebab-case throughout, except the ping diagnostic", () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      if (name === "ping") continue;
      expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
