import { describe, expect, it } from "vitest";
import {
  checkExpectEmpty,
  checkPreferredSource,
  dedupeRankedSources,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "./metrics.js";

const exp = (sourceType: string, sourceId: string) => ({ sourceType, sourceId });
const res = (sourceType: string, sourceId: string, score = 0.9) => ({
  sourceType,
  sourceId,
  score,
});

describe("dedupeRankedSources", () => {
  it("collapses repeated chunks from the same source into one entry, keeping first-seen rank", () => {
    const ranked = dedupeRankedSources([
      res("project", "a"),
      res("project", "a"),
      res("experience", "b"),
    ]);
    expect(ranked).toEqual(["project:a", "experience:b"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(dedupeRankedSources([])).toEqual([]);
  });
});

describe("recallAtK", () => {
  it("hand-computed: 2 of 3 expected sources retrieved -> 2/3", () => {
    const retrieved = [res("skill", "a"), res("experience", "x"), res("project", "z")];
    const expected = [exp("skill", "a"), exp("experience", "x"), exp("experience", "missing")];
    expect(recallAtK(retrieved, expected)).toBeCloseTo(2 / 3, 10);
  });

  it("edge case: no results retrieved with a non-empty expected set -> 0", () => {
    expect(recallAtK([], [exp("skill", "a")])).toBe(0);
  });

  it("edge case: all expected sources retrieved -> 1", () => {
    const retrieved = [res("skill", "a"), res("skill", "b")];
    const expected = [exp("skill", "a"), exp("skill", "b")];
    expect(recallAtK(retrieved, expected)).toBe(1);
  });

  it("edge case: empty expected set is vacuously satisfied -> 1, regardless of what was retrieved", () => {
    expect(recallAtK([], [])).toBe(1);
    expect(recallAtK([res("skill", "a")], [])).toBe(1);
  });

  it("duplicate chunks for the same source only count once toward recall", () => {
    const retrieved = [res("skill", "a"), res("skill", "a"), res("skill", "a")];
    const expected = [exp("skill", "a"), exp("skill", "b")];
    expect(recallAtK(retrieved, expected)).toBe(0.5);
  });
});

describe("precisionAtK", () => {
  it("hand-computed: 1 of 3 deduplicated retrieved sources is relevant -> 1/3", () => {
    const retrieved = [res("skill", "a"), res("experience", "x"), res("project", "z")];
    const expected = [exp("skill", "a")];
    expect(precisionAtK(retrieved, expected)).toBeCloseTo(1 / 3, 10);
  });

  it("edge case: no results retrieved -> 0", () => {
    expect(precisionAtK([], [exp("skill", "a")])).toBe(0);
  });

  it("edge case: every retrieved source is relevant -> 1", () => {
    const retrieved = [res("skill", "a"), res("skill", "b")];
    const expected = [exp("skill", "a"), exp("skill", "b"), exp("skill", "c")];
    expect(precisionAtK(retrieved, expected)).toBe(1);
  });

  it("duplicate chunks for the same source only count once in the denominator", () => {
    const retrieved = [res("skill", "a"), res("skill", "a")];
    const expected = [exp("skill", "a")];
    expect(precisionAtK(retrieved, expected)).toBe(1);
  });
});

describe("reciprocalRank", () => {
  it("hand-computed: first relevant source is rank 2 -> 1/2", () => {
    const retrieved = [res("project", "z"), res("skill", "a"), res("experience", "x")];
    const expected = [exp("skill", "a")];
    expect(reciprocalRank(retrieved, expected)).toBe(0.5);
  });

  it("edge case: first retrieved source is relevant -> 1", () => {
    const retrieved = [res("skill", "a"), res("project", "z")];
    const expected = [exp("skill", "a")];
    expect(reciprocalRank(retrieved, expected)).toBe(1);
  });

  it("edge case: no relevant source retrieved -> 0", () => {
    const retrieved = [res("project", "z")];
    const expected = [exp("skill", "a")];
    expect(reciprocalRank(retrieved, expected)).toBe(0);
  });

  it("edge case: no results retrieved -> 0", () => {
    expect(reciprocalRank([], [exp("skill", "a")])).toBe(0);
  });

  it("only counts the first occurrence of a duplicated relevant source", () => {
    const retrieved = [res("project", "z"), res("skill", "a"), res("skill", "a")];
    const expected = [exp("skill", "a")];
    expect(reciprocalRank(retrieved, expected)).toBe(0.5);
  });
});

describe("recallAtK: matchMode (#295)", () => {
  it("matchMode 'any': recall is 1 when at least one acceptable source is retrieved", () => {
    const retrieved = [res("story", "a")];
    const expected = [exp("story", "a"), exp("story", "b")];
    expect(recallAtK(retrieved, expected, "any")).toBe(1);
  });

  it("matchMode 'any': recall is 0 when no acceptable source is retrieved", () => {
    const retrieved = [res("story", "z")];
    const expected = [exp("story", "a"), exp("story", "b")];
    expect(recallAtK(retrieved, expected, "any")).toBe(0);
  });

  it("matchMode 'all' (explicit) behaves like the default fraction-of-required computation", () => {
    const retrieved = [res("story", "a")];
    const expected = [exp("story", "a"), exp("story", "b")];
    expect(recallAtK(retrieved, expected, "all")).toBe(0.5);
  });

  it("defaults to 'all' semantics when matchMode is omitted", () => {
    const retrieved = [res("story", "a")];
    const expected = [exp("story", "a"), exp("story", "b")];
    expect(recallAtK(retrieved, expected)).toBe(recallAtK(retrieved, expected, "all"));
  });
});

describe("checkPreferredSource (#295)", () => {
  it("passes when the preferred source is retrieved and ranks above every other acceptable source", () => {
    const retrieved = [res("story", "preferred"), res("story", "alt")];
    const expected = [exp("story", "preferred"), exp("story", "alt")];
    const check = checkPreferredSource(retrieved, expected, exp("story", "preferred"));
    expect(check.passed).toBe(true);
    expect(check.preferredRetrieved).toBe(true);
    expect(check.reciprocalRank).toBe(1);
    expect(check.outrankedBy).toEqual([]);
  });

  it("fails when an acceptable alternative outranks the preferred source", () => {
    const retrieved = [res("story", "alt"), res("story", "preferred")];
    const expected = [exp("story", "preferred"), exp("story", "alt")];
    const check = checkPreferredSource(retrieved, expected, exp("story", "preferred"));
    expect(check.passed).toBe(false);
    expect(check.outrankedBy).toEqual([exp("story", "alt")]);
  });

  it("passes when an unexpected, non-acceptable source ranks above the preferred source", () => {
    const retrieved = [res("story", "unrelated"), res("story", "preferred")];
    const expected = [exp("story", "preferred"), exp("story", "alt")];
    const check = checkPreferredSource(retrieved, expected, exp("story", "preferred"));
    expect(check.passed).toBe(true);
    expect(check.outrankedBy).toEqual([]);
  });

  it("fails when the preferred source is not retrieved at all", () => {
    const retrieved = [res("story", "alt")];
    const expected = [exp("story", "preferred"), exp("story", "alt")];
    const check = checkPreferredSource(retrieved, expected, exp("story", "preferred"));
    expect(check.passed).toBe(false);
    expect(check.preferredRetrieved).toBe(false);
    expect(check.reciprocalRank).toBe(0);
  });
});

describe("checkExpectEmpty", () => {
  it("passes when no result scores at or above minScore", () => {
    const results = [res("project", "z", 0.2), res("skill", "a", 0.1)];
    expect(checkExpectEmpty(results, 0.5)).toEqual({ passed: true, aboveThreshold: [] });
  });

  it("passes on a fully empty result set", () => {
    expect(checkExpectEmpty([], 0.5)).toEqual({ passed: true, aboveThreshold: [] });
  });

  it("fails and reports the offending sources when a result scores at or above minScore", () => {
    const results = [res("project", "z", 0.6), res("skill", "a", 0.2)];
    expect(checkExpectEmpty(results, 0.5)).toEqual({
      passed: false,
      aboveThreshold: [res("project", "z", 0.6)],
    });
  });

  it("treats a result exactly at minScore as violating (>=, not >)", () => {
    const results = [res("project", "z", 0.5)];
    expect(checkExpectEmpty(results, 0.5).passed).toBe(false);
  });
});
