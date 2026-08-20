import { describe, expect, it } from "vitest";
import { EXPECTED_TOOL_NAMES } from "./tool-names.js";

describe("EXPECTED_TOOL_NAMES", () => {
  it("lists exactly the four career tools plus ping, with no duplicates", () => {
    expect(EXPECTED_TOOL_NAMES).toEqual([
      "ping",
      "get-profile",
      "get-experience",
      "search-projects",
      "get-skill-evidence",
    ]);
    expect(new Set(EXPECTED_TOOL_NAMES).size).toBe(EXPECTED_TOOL_NAMES.length);
  });
});
