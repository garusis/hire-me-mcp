import { describe, expect, it } from "vitest";
import { clampScore } from "./types.js";

describe("clampScore", () => {
  it("passes through a value already inside [0, 1]", () => {
    expect(clampScore(0.42)).toBe(0.42);
  });

  it("clamps a value above 1 down to 1", () => {
    expect(clampScore(1.5)).toBe(1);
  });

  it("clamps a value below 0 up to 0", () => {
    expect(clampScore(-0.3)).toBe(0);
  });

  it("rounds to avoid floating point noise past 4 decimal places", () => {
    expect(clampScore(1 / 3)).toBe(0.3333);
  });
});
