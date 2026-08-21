import { describe, expect, it } from "vitest";
import { scoreGapHonesty, scoreGroundedness, scoreRelevance } from "./index.js";

describe("scorers barrel", () => {
  it("re-exports all three scorers", () => {
    expect(typeof scoreGroundedness).toBe("function");
    expect(typeof scoreGapHonesty).toBe("function");
    expect(typeof scoreRelevance).toBe("function");
  });
});
