import { describe, expect, it } from "vitest";
import { EXPECTED_TOOL_NAMES } from "./tool-names.js";

describe("EXPECTED_TOOL_NAMES", () => {
  it("lists exactly the thirteen career tools plus ping, with no duplicates (#61 adds search-career; #211-#215 add the list tools; #293 adds list-career-stories; #315 adds get-cv-presentation)", () => {
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
      "list-career-stories",
      "get-cv-presentation",
    ]);
    expect(new Set(EXPECTED_TOOL_NAMES).size).toBe(EXPECTED_TOOL_NAMES.length);
  });

  it("includes get-cv-presentation (#315), the CV-overlay-merged presentation tool", () => {
    expect(EXPECTED_TOOL_NAMES).toContain("get-cv-presentation");
  });

  it("includes list-career-stories (#293), the deterministic behavioral-story tool, and no duplicate search-stories tool (#288)", () => {
    expect(EXPECTED_TOOL_NAMES).toContain("list-career-stories");
    expect(EXPECTED_TOOL_NAMES).not.toContain("search-stories");
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
