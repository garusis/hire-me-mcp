#!/usr/bin/env node
/**
 * Thin CLI wrapper around the decision module, invoked by the bash hooks in
 * .claude/hooks/. Keeps the actual allow/block logic in tested TypeScript
 * (src/decision.ts, src/pathMapping.ts, src/testContentAnalysis.ts,
 * src/applyEdit.ts) rather than duplicated in shell.
 *
 * Usage:
 *   tdd-guard classify <repoRelativePath>
 *     -> prints "source" | "test" | "other"
 *
 *   tdd-guard expected-test <repoRelativePath>
 *     -> prints the mapped test path, or nothing (exit 1) if not a source file
 *
 *   tdd-guard pre-edit
 *     -> reads a JSON payload on stdin:
 *          { toolName, filePath, toolInput, oldContent,
 *            testFileExists?, testFileIsFailing? }
 *        filePath must already be repo-relative. For a "test" path,
 *        newContent is derived from oldContent + toolInput. For a "source"
 *        path, testFileExists/testFileIsFailing must be supplied (the hook
 *        determines these by checking the filesystem and running vitest).
 *        Prints `{"decision","reason"}` on stdout; exits 0 for "allow",
 *        1 for "block".
 *
 *   tdd-guard pre-delete <repoRelativePath>
 *     -> decides whether deleting this path (e.g. via a Bash `rm`) should
 *        be blocked. Prints `{"decision","reason"}`; exits 0/1 as above.
 */
import { applyEditToolInput } from "./applyEdit.js";
import { decide } from "./decision.js";
import { classifyPath, mapSourceToTest } from "./pathMapping.js";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

interface PreEditPayload {
  toolName: string;
  filePath: string;
  toolInput?: unknown;
  oldContent?: string;
  testFileExists?: boolean;
  testFileIsFailing?: boolean | null;
}

function printAndExit(result: { decision: "allow" | "block"; reason: string }): never {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.decision === "allow" ? 0 : 1);
}

async function runPreEdit(): Promise<void> {
  const raw = await readStdin();
  let payload: PreEditPayload;
  try {
    payload = JSON.parse(raw) as PreEditPayload;
  } catch (error) {
    process.stderr.write(`tdd-guard: invalid JSON on stdin: ${(error as Error).message}\n`);
    process.exit(64);
    return;
  }

  const pathKind = classifyPath(payload.filePath);
  const toolName = (payload.toolName ?? "Edit") as "Edit" | "Write" | "MultiEdit" | "NotebookEdit";

  if (pathKind === "test") {
    const oldContent = payload.oldContent ?? "";
    const newContent = applyEditToolInput(oldContent, payload.toolName, payload.toolInput);
    printAndExit(
      decide({
        kind: "test-edit",
        toolName,
        filePath: payload.filePath,
        oldContent,
        newContent,
      }),
    );
    return;
  }

  if (pathKind === "source") {
    printAndExit(
      decide({
        kind: "source-edit",
        toolName,
        filePath: payload.filePath,
        testFileExists: payload.testFileExists ?? false,
        testFileIsFailing: payload.testFileIsFailing ?? null,
      }),
    );
    return;
  }

  printAndExit({ decision: "allow", reason: `"${payload.filePath}" is not enforced.` });
}

function runPreDelete(filePath: string | undefined): void {
  if (!filePath) {
    process.stderr.write("usage: tdd-guard pre-delete <repoRelativePath>\n");
    process.exit(64);
    return;
  }
  if (classifyPath(filePath) !== "test") {
    printAndExit({ decision: "allow", reason: `"${filePath}" is not a protected test file.` });
    return;
  }
  printAndExit(decide({ kind: "test-delete", filePath }));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "classify") {
    const filePath = args[0];
    if (!filePath) {
      process.stderr.write("usage: tdd-guard classify <repoRelativePath>\n");
      process.exit(64);
      return;
    }
    process.stdout.write(`${classifyPath(filePath)}\n`);
    return;
  }

  if (command === "expected-test") {
    const filePath = args[0];
    if (!filePath) {
      process.stderr.write("usage: tdd-guard expected-test <repoRelativePath>\n");
      process.exit(64);
      return;
    }
    const testPath = mapSourceToTest(filePath);
    if (!testPath) {
      process.exit(1);
      return;
    }
    process.stdout.write(`${testPath}\n`);
    return;
  }

  if (command === "pre-edit") {
    await runPreEdit();
    return;
  }

  if (command === "pre-delete") {
    runPreDelete(args[0]);
    return;
  }

  process.stderr.write(
    `tdd-guard: unknown command "${command ?? ""}". Expected classify | expected-test | pre-edit | pre-delete.\n`,
  );
  process.exit(64);
}

main().catch((error: unknown) => {
  process.stderr.write(`tdd-guard: unexpected error: ${(error as Error).message}\n`);
  process.exit(70);
});
