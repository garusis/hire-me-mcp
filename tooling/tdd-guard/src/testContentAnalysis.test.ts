import { describe, expect, it } from "vitest";
import {
  countAssertions,
  countTestCases,
  detectTestWeakening,
  hasSkipOrOnly,
} from "./testContentAnalysis.js";

describe("hasSkipOrOnly", () => {
  it("detects it.skip(", () => {
    expect(hasSkipOrOnly('it.skip("does a thing", () => {})')).toBe(true);
  });

  it("detects test.only(", () => {
    expect(hasSkipOrOnly('test.only("does a thing", () => {})')).toBe(true);
  });

  it("detects describe.skip(", () => {
    expect(hasSkipOrOnly('describe.skip("a suite", () => {})')).toBe(true);
  });

  it("returns false for plain it(", () => {
    expect(hasSkipOrOnly('it("does a thing", () => {})')).toBe(false);
  });
});

describe("countTestCases / countAssertions", () => {
  const content = `
    it("case one", () => { expect(1).toBe(1); });
    test("case two", () => { expect(2).toBe(2); expect(3).toBe(3); });
  `;

  it("counts it() and test() declarations", () => {
    expect(countTestCases(content)).toBe(2);
  });

  it("counts expect() calls", () => {
    expect(countAssertions(content)).toBe(3);
  });
});

describe("detectTestWeakening", () => {
  it("allows growing the suite (more cases, more assertions)", () => {
    const oldContent = 'it("a", () => { expect(1).toBe(1); });';
    const newContent =
      'it("a", () => { expect(1).toBe(1); }); it("b", () => { expect(2).toBe(2); });';
    const result = detectTestWeakening(oldContent, newContent);
    expect(result.weakened).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("blocks adding .only to an existing test", () => {
    const oldContent = 'it("a", () => { expect(1).toBe(1); });';
    const newContent = 'it.only("a", () => { expect(1).toBe(1); });';
    const result = detectTestWeakening(oldContent, newContent);
    expect(result.weakened).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/\.skip|\.only/);
  });

  it("blocks adding .skip to an existing test", () => {
    const oldContent = 'it("a", () => { expect(1).toBe(1); });';
    const newContent = 'it.skip("a", () => { expect(1).toBe(1); });';
    const result = detectTestWeakening(oldContent, newContent);
    expect(result.weakened).toBe(true);
  });

  it("blocks removing a test case", () => {
    const oldContent =
      'it("a", () => { expect(1).toBe(1); }); it("b", () => { expect(2).toBe(2); });';
    const newContent = 'it("a", () => { expect(1).toBe(1); });';
    const result = detectTestWeakening(oldContent, newContent);
    expect(result.weakened).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/removes 1 test case/);
  });

  it("blocks removing assertions while keeping the same test case count", () => {
    const oldContent = 'it("a", () => { expect(1).toBe(1); expect(2).toBe(2); });';
    const newContent = 'it("a", () => { expect(1).toBe(1); });';
    const result = detectTestWeakening(oldContent, newContent);
    expect(result.weakened).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/assertion/);
  });
});
