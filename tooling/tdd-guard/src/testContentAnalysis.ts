/**
 * Heuristics for detecting when a test file edit *weakens* the suite instead
 * of extending it: adding `.skip`/`.only`, or removing test cases/assertions.
 *
 * These are intentionally simple regex-based heuristics (no TS parser
 * dependency) so the PreToolUse hook stays fast and dependency-free.
 */

const SKIP_OR_ONLY_PATTERN = /\b(?:it|test|describe)\.(?:skip|only)\s*\(/;

/** True if the content calls `.skip(` or `.only(` on it/test/describe. */
export function hasSkipOrOnly(content: string): boolean {
  return SKIP_OR_ONLY_PATTERN.test(content);
}

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

/** Number of `it(...)` / `test(...)` case declarations in the content. */
export function countTestCases(content: string): number {
  return countMatches(content, /\b(?:it|test)\s*\(/g);
}

/** Number of `expect(...)` assertion calls in the content. */
export function countAssertions(content: string): number {
  return countMatches(content, /\bexpect\s*\(/g);
}

export interface TestWeakeningResult {
  weakened: boolean;
  reasons: string[];
}

/**
 * Compares a test file's old and new content and reports whether the edit
 * weakens the suite: skip/only added, test cases removed, or assertions
 * removed without a matching drop in test cases (i.e. cases kept but gutted).
 */
export function detectTestWeakening(oldContent: string, newContent: string): TestWeakeningResult {
  const reasons: string[] = [];

  if (hasSkipOrOnly(newContent) && !hasSkipOrOnly(oldContent)) {
    reasons.push("adds .skip(...) or .only(...), which disables other tests");
  }

  const oldCases = countTestCases(oldContent);
  const newCases = countTestCases(newContent);
  if (newCases < oldCases) {
    reasons.push(`removes ${oldCases - newCases} test case(s) (${oldCases} -> ${newCases})`);
  }

  const oldAssertions = countAssertions(oldContent);
  const newAssertions = countAssertions(newContent);
  if (newAssertions < oldAssertions && newCases >= oldCases) {
    reasons.push(
      `removes ${oldAssertions - newAssertions} assertion(s) without removing test cases (${oldAssertions} -> ${newAssertions} expect(...) calls)`,
    );
  }

  return { weakened: reasons.length > 0, reasons };
}
