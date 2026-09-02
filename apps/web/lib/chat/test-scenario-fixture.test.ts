import { describe, expect, it } from "vitest";
import { readChatTestCitationIds } from "./test-scenario-fixture";

const EXPECTED_FIELDS = [
  "experience",
  "project",
  "skill",
  "gap",
  "writing",
  "profile",
  "education",
  "recommendation",
  "story",
] as const;

describe("readChatTestCitationIds", () => {
  it("resolves every ChatTestCitationIds field — including story (#295) — to a non-empty id from the real dataset", () => {
    const ids = readChatTestCitationIds();

    expect(Object.keys(ids).sort()).toEqual([...EXPECTED_FIELDS].sort());
    for (const field of EXPECTED_FIELDS) {
      const value = ids[field];
      expect(value, `${field} should be a non-empty string`).toEqual(expect.any(String));
      expect(value.length, `${field} should be a non-empty string`).toBeGreaterThan(0);
    }
  });

  it("resolves story (#295) to a REAL authored story id, not the unauthored placeholder — the real dataset has stories", () => {
    const ids = readChatTestCitationIds();

    expect(ids.story).not.toBe("unauthored-story");
  });

  it("memoizes across calls within the same process", () => {
    expect(readChatTestCitationIds()).toBe(readChatTestCitationIds());
  });
});
