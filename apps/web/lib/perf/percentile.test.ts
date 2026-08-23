import { describe, expect, it } from "vitest";
import { percentile } from "./percentile";

/**
 * Unit coverage for the percentile helper the latency budget specs
 * (`apps/web/e2e-preview/specs/latency.spec.ts`, #62) use to turn a sample
 * of per-call durations into the single p75 number asserted against a
 * committed threshold. Pure math, no network — kept independently testable
 * here rather than only exercised indirectly by a real Playwright run
 * against a live preview.
 */
describe("percentile", () => {
  it("returns the single value for a one-element sample regardless of p", () => {
    expect(percentile([42], 75)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("returns the exact value at p0 (min) and p100 (max)", () => {
    const values = [5, 1, 9, 3, 7];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("computes p75 via linear interpolation on a sorted sample", () => {
    // Sorted: [10, 20, 30, 40] — p75 index = 0.75 * 3 = 2.25 -> interpolate
    // between values[2]=30 and values[3]=40 by 0.25 -> 32.5
    expect(percentile([40, 10, 30, 20], 75)).toBeCloseTo(32.5);
  });

  it("does not mutate the input array (sorts a copy)", () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });

  it("throws on an empty sample", () => {
    expect(() => percentile([], 75)).toThrow(/empty/i);
  });

  it("throws on an out-of-range percentile", () => {
    expect(() => percentile([1, 2, 3], -1)).toThrow(/0.*100/);
    expect(() => percentile([1, 2, 3], 101)).toThrow(/0.*100/);
  });
});
