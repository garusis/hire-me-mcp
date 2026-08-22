import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs cli.ts as a real subprocess (mirroring db/migrate-cli.test.ts) rather
// than importing it — importing would run its top-level side effects
// (connecting to a real database, calling a real embedding API) at test
// collection time. This test only exercises the fast, network-free
// misconfigured-env and bad-flag paths.
const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
const tsxBin = path.join(packageDir, "node_modules", ".bin", "tsx");

function runCli(args: string[], env: NodeJS.ProcessEnv): { status: number; output: string } {
  try {
    const output = execFileSync(tsxBin, [cliPath, ...args], { encoding: "utf-8", env });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe("ingest cli", () => {
  it("exits non-zero with a clear message when DATABASE_URL is not set", () => {
    const { PATH, HOME } = process.env;
    const { status, output } = runCli([], {
      PATH,
      HOME,
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    });

    expect(status).not.toBe(0);
    expect(output).toMatch(/DATABASE_URL/);
  });

  it("exits non-zero with a clear message when GOOGLE_GENERATIVE_AI_API_KEY is not set", () => {
    const { PATH, HOME } = process.env;
    const { status, output } = runCli([], {
      PATH,
      HOME,
      DATABASE_URL: "postgres://user:pass@host/db",
    });

    expect(status).not.toBe(0);
    expect(output).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("exits non-zero with a clear message for an unrecognized flag", () => {
    const { PATH, HOME } = process.env;
    const { status, output } = runCli(["--bogus"], {
      PATH,
      HOME,
      DATABASE_URL: "postgres://user:pass@host/db",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    });

    expect(status).not.toBe(0);
    expect(output).toMatch(/--bogus/);
  });
});
