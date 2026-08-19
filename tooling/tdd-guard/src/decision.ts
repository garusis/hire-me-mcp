import { classifyPath, mapSourceToTest } from "./pathMapping.js";
import { detectTestWeakening } from "./testContentAnalysis.js";

export type Decision = "allow" | "block";

export interface DecisionResult {
  decision: Decision;
  reason: string;
}

export type EditToolName = "Edit" | "Write" | "MultiEdit" | "NotebookEdit";

export interface SourceEditInput {
  kind: "source-edit";
  toolName: EditToolName;
  /** Repo-relative path of the file being created/modified. */
  filePath: string;
  /** Does the target test file exist on disk right now? */
  testFileExists: boolean;
  /**
   * Does the mapped test file currently fail when run?
   * `null` means "unknown / could not be determined" (e.g. test file
   * doesn't exist, or the runner timed out) and is treated as not-failing.
   */
  testFileIsFailing: boolean | null;
}

export interface TestEditInput {
  kind: "test-edit";
  toolName: EditToolName;
  /** Repo-relative path of the test file being modified. */
  filePath: string;
  /** Test file content before the edit (empty string if the file is new). */
  oldContent: string;
  /** Test file content the edit would produce. */
  newContent: string;
}

export interface TestDeleteInput {
  kind: "test-delete";
  /** Repo-relative path of the test file a Bash command targets for deletion. */
  filePath: string;
}

export type DecisionInput = SourceEditInput | TestEditInput | TestDeleteInput;

/**
 * The single allow/block decision function used by the PreToolUse hook.
 *
 * Pure and side-effect free: all repo state (does a test exist, is it
 * failing, old/new file content) is gathered by the hook/CLI and passed in.
 */
export function decide(input: DecisionInput): DecisionResult {
  if (input.kind === "test-delete") {
    return {
      decision: "block",
      reason: `Blocked: deleting test file "${input.filePath}" is not allowed. Tests define the contract — remove behavior via a reviewed edit that keeps coverage, not by deleting the file.`,
    };
  }

  if (input.kind === "test-edit") {
    const pathKind = classifyPath(input.filePath);
    if (pathKind !== "test") {
      return { decision: "allow", reason: `"${input.filePath}" is not a protected test file.` };
    }

    const { weakened, reasons } = detectTestWeakening(input.oldContent, input.newContent);
    if (weakened) {
      return {
        decision: "block",
        reason: `Blocked: this edit weakens "${input.filePath}": ${reasons.join("; ")}. Fix the implementation instead of loosening the test — see .claude/rules/tdd-test-files.md.`,
      };
    }

    return {
      decision: "allow",
      reason: `"${input.filePath}" edit does not weaken existing coverage.`,
    };
  }

  // input.kind === "source-edit"
  const pathKind = classifyPath(input.filePath);
  if (pathKind !== "source") {
    return { decision: "allow", reason: `"${input.filePath}" is not an enforced source file.` };
  }

  const expectedTestPath = mapSourceToTest(input.filePath);

  if (!input.testFileExists) {
    return {
      decision: "block",
      reason: `Blocked: no test file found for "${input.filePath}". Test-first: create "${expectedTestPath}" with a failing test that specifies the behavior before editing the source file. See .claude/rules/tdd-source-files.md.`,
    };
  }

  if (input.testFileIsFailing !== true) {
    return {
      decision: "block",
      reason: `Blocked: "${expectedTestPath}" exists but is not currently failing. Test-first requires a red test before you touch "${input.filePath}" — add/update a failing test in "${expectedTestPath}" first (or set TDD_SKIP_GUARD=1 for a documented, exceptional refactor). See .claude/rules/tdd-source-files.md.`,
    };
  }

  return {
    decision: "allow",
    reason: `"${expectedTestPath}" is failing — proceeding to make it pass.`,
  };
}
