import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = fileURLToPath(new URL("./validate-cli.ts", import.meta.url));
const tsxBin = path.join(packageDir, "node_modules", ".bin", "tsx");
const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`./content/__fixtures__/${name}/`, import.meta.url));

function runCli(contentDir: string): { status: number; output: string } {
  try {
    const output = execFileSync(tsxBin, [cliPath, contentDir], { encoding: "utf-8" });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe("validate-cli", () => {
  it("exits 0 against a fully valid content directory", () => {
    const { status } = runCli(fixtureDir("valid-content"));
    expect(status).toBe(0);
  });

  it("exits non-zero against an invalid content directory", () => {
    const { status } = runCli(fixtureDir("invalid-content"));
    expect(status).not.toBe(0);
  });

  it("prints the offending file path and field path for an invalid content directory", () => {
    const { output } = runCli(fixtureDir("invalid-content"));
    expect(output).toContain("profile.json");
    expect(output).toContain("headline");
  });
});
