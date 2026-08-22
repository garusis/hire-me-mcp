import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs migrate-cli.ts as a real subprocess (like career-data's
// validate-cli.test.ts) rather than importing it — importing would run its
// top-level migration side effect against a real database at test-collection
// time, which is exactly what the DATABASE_URL-gated integration suite
// (migrate.integration.test.ts) is for. This test only exercises the fast,
// network-free "misconfigured" path.
const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const cliPath = fileURLToPath(new URL("./migrate-cli.ts", import.meta.url));
const tsxBin = path.join(packageDir, "node_modules", ".bin", "tsx");

function runCli(env: NodeJS.ProcessEnv): { status: number; output: string } {
  try {
    const output = execFileSync(tsxBin, [cliPath], { encoding: "utf-8", env });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe("migrate-cli", () => {
  it("exits non-zero with a clear message when DATABASE_URL is not set", () => {
    const { PATH, HOME } = process.env;
    const { status, output } = runCli({ PATH, HOME });

    expect(status).not.toBe(0);
    expect(output).toMatch(/DATABASE_URL/);
  });
});
