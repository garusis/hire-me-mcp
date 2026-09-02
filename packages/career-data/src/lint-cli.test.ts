import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const cliPath = fileURLToPath(new URL("./lint-cli.ts", import.meta.url));
const tsxBin = path.join(packageDir, "..", "node_modules", ".bin", "tsx");
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

describe("lint-cli", () => {
  it("exits 0 against a lint-clean content directory", () => {
    const { status } = runCli(fixtureDir("lint-valid-content"));
    expect(status).toBe(0);
  });

  it("exits non-zero against a directory with error-severity violations", () => {
    const { status } = runCli(fixtureDir("lint-broken-content"));
    expect(status).not.toBe(0);
  });

  it("prints the rule name, file path and entity id for a deliberately broken fixture", () => {
    const { output } = runCli(fixtureDir("lint-broken-content"));
    expect(output).toContain("citation-resolves");
    expect(output).toContain("skills.json");
    expect(output).toContain("typescript");
    expect(output).toContain("tag-in-vocabulary");
    expect(output).toContain("experience/fixture-role.json");
    expect(output).toContain("fixture-role-fixtureco-2020");
  });

  it("prints the blocking story-preservation violations for the broken fixture (#290)", () => {
    const { output } = runCli(fixtureDir("lint-broken-content"));
    expect(output).toContain("story-preservation-map-resolves");
    expect(output).toContain("story-preservation-map.json");
  });

  it("exits 0 against the real, authored content set", () => {
    const { status, output } = runCli(fileURLToPath(new URL("../content/", import.meta.url)));
    expect(status).toBe(0);
    expect(output).toContain("lint passed");
  });
});
