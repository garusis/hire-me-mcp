import { describe, expect, it } from "vitest";
import { decide } from "./decision.js";

describe("decide — source edits", () => {
  it("allow: test exists and is currently failing", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.ts",
      testFileExists: true,
      testFileIsFailing: true,
    });
    expect(result.decision).toBe("allow");
  });

  it("block-no-test: no corresponding test file exists, and names the expected path", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Write",
      filePath: "packages/core/src/greet.ts",
      testFileExists: false,
      testFileIsFailing: null,
    });
    expect(result.decision).toBe("block");
    expect(result.reason).toContain("packages/core/src/greet.test.ts");
  });

  it("blocks when the test exists but is currently passing (not red)", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.ts",
      testFileExists: true,
      testFileIsFailing: false,
    });
    expect(result.decision).toBe("block");
    expect(result.reason).toContain("not currently failing");
  });

  it("blocks when failing-state is unknown (treated as not-failing)", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.ts",
      testFileExists: true,
      testFileIsFailing: null,
    });
    expect(result.decision).toBe("block");
  });

  it("allows edits to files outside the enforced source globs", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Edit",
      filePath: "README.md",
      testFileExists: false,
      testFileIsFailing: null,
    });
    expect(result.decision).toBe("allow");
  });

  it("allows edits to config files even though they end in .ts", () => {
    const result = decide({
      kind: "source-edit",
      toolName: "Edit",
      filePath: "packages/core/vitest.config.ts",
      testFileExists: false,
      testFileIsFailing: null,
    });
    expect(result.decision).toBe("allow");
  });
});

describe("decide — test edits", () => {
  it("allow: creating a brand new test file", () => {
    const result = decide({
      kind: "test-edit",
      toolName: "Write",
      filePath: "packages/core/src/greet.test.ts",
      oldContent: "",
      newContent: 'it("greets", () => { expect(1).toBe(1); });',
    });
    expect(result.decision).toBe("allow");
  });

  it("allow: editing a test file to add more coverage", () => {
    const result = decide({
      kind: "test-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.test.ts",
      oldContent: 'it("a", () => { expect(1).toBe(1); });',
      newContent: 'it("a", () => { expect(1).toBe(1); }); it("b", () => { expect(2).toBe(2); });',
    });
    expect(result.decision).toBe("allow");
  });

  it("block-.only: adding .only to a test is blocked with an explanatory message", () => {
    const result = decide({
      kind: "test-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.test.ts",
      oldContent: 'it("a", () => { expect(1).toBe(1); });',
      newContent: 'it.only("a", () => { expect(1).toBe(1); });',
    });
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/\.only/);
  });

  it("blocks weakening assertions in a test file", () => {
    const result = decide({
      kind: "test-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.test.ts",
      oldContent: 'it("a", () => { expect(1).toBe(1); expect(2).toBe(2); });',
      newContent: 'it("a", () => { expect(1).toBe(1); });',
    });
    expect(result.decision).toBe("block");
  });

  it("allows edits to non-test files routed through the test-edit path (defensive)", () => {
    const result = decide({
      kind: "test-edit",
      toolName: "Edit",
      filePath: "packages/core/src/greet.ts",
      oldContent: "export const a = 1;",
      newContent: "export const a = 2;",
    });
    expect(result.decision).toBe("allow");
  });
});

describe("decide — test deletion", () => {
  it("block-test-deletion: deleting a test file is blocked with an explanatory message", () => {
    const result = decide({
      kind: "test-delete",
      filePath: "packages/core/src/greet.test.ts",
    });
    expect(result.decision).toBe("block");
    expect(result.reason).toContain("greet.test.ts");
    expect(result.reason.toLowerCase()).toContain("delet");
  });
});
