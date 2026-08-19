#!/usr/bin/env node
import { type DecisionInput, decide } from "./decision.js";
/**
 * Thin CLI wrapper around the decision module, invoked by the bash hooks in
 * .claude/hooks/. Keeps the actual allow/block logic in tested TypeScript
 * (src/decision.ts, src/pathMapping.ts) rather than duplicated in shell.
 *
 * Usage:
 *   tdd-guard classify <repoRelativePath>
 *     -> prints "source" | "test" | "other"
 *
 *   tdd-guard expected-test <repoRelativePath>
 *     -> prints the mapped test path, or nothing (exit 1) if not a source file
 *
 *   tdd-guard decide
 *     -> reads a JSON DecisionInput on stdin, prints `{"decision","reason"}`
 *        on stdout, and exits 0 for "allow" or 1 for "block".
 */
import { classifyPath, mapSourceToTest } from "./pathMapping.js";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "classify") {
    const filePath = args[0];
    if (!filePath) {
      process.stderr.write("usage: tdd-guard classify <repoRelativePath>\n");
      process.exit(64);
    }
    process.stdout.write(`${classifyPath(filePath)}\n`);
    return;
  }

  if (command === "expected-test") {
    const filePath = args[0];
    if (!filePath) {
      process.stderr.write("usage: tdd-guard expected-test <repoRelativePath>\n");
      process.exit(64);
    }
    const testPath = mapSourceToTest(filePath);
    if (!testPath) {
      process.exit(1);
    }
    process.stdout.write(`${testPath}\n`);
    return;
  }

  if (command === "decide") {
    const raw = await readStdin();
    let input: DecisionInput;
    try {
      input = JSON.parse(raw) as DecisionInput;
    } catch (error) {
      process.stderr.write(`tdd-guard: invalid JSON on stdin: ${(error as Error).message}\n`);
      process.exit(64);
      return;
    }
    const result = decide(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.decision === "allow" ? 0 : 1);
    return;
  }

  process.stderr.write(
    `tdd-guard: unknown command "${command ?? ""}". Expected classify | expected-test | decide.\n`,
  );
  process.exit(64);
}

main().catch((error: unknown) => {
  process.stderr.write(`tdd-guard: unexpected error: ${(error as Error).message}\n`);
  process.exit(70);
});
