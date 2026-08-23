import { describe, expect, it } from "vitest";
import { scoreGapHonesty, scoreGroundedness, scoreRelevance, scoreToolRouting } from "./index.js";

describe("scorers barrel", () => {
  it("re-exports all three answer-content scorers", () => {
    expect(typeof scoreGroundedness).toBe("function");
    expect(typeof scoreGapHonesty).toBe("function");
    expect(typeof scoreRelevance).toBe("function");
  });

  it("re-exports the tool-routing scorer (#75)", () => {
    expect(typeof scoreToolRouting).toBe("function");
  });
});
