import { describe, expect, it } from "vitest";
import { STARTER_PROMPTS } from "./starter-prompts";

describe("STARTER_PROMPTS", () => {
  it("includes at least one grounded question, so the agent's ability to answer from real facts is discoverable", () => {
    expect(STARTER_PROMPTS.some((prompt) => prompt.kind === "grounded")).toBe(true);
  });

  it("includes at least one gap question, so the honesty behaviour is discoverable without coaching", () => {
    expect(STARTER_PROMPTS.some((prompt) => prompt.kind === "gap")).toBe(true);
  });

  it("gives every starter prompt a non-empty id and question text", () => {
    for (const prompt of STARTER_PROMPTS) {
      expect(prompt.id.length).toBeGreaterThan(0);
      expect(prompt.text.length).toBeGreaterThan(0);
    }
  });

  it("has unique ids across all starter prompts", () => {
    const ids = STARTER_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
