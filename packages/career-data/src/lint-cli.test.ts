import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const cliPath = fileURLToPath(new URL("./lint-cli.ts", import.meta.url));
const tsxBin = path.join(packageDir, "..", "node_modules", ".bin", "tsx");
const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`./content/__fixtures__/${name}/`, import.meta.url));
const realContentDir = fileURLToPath(new URL("../content/", import.meta.url));

interface CliRun {
  status: number;
  output: string;
}

function runCli(contentDir: string): CliRun {
  try {
    const output = execFileSync(tsxBin, [cliPath, contentDir], { encoding: "utf-8" });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

/**
 * Spawning `tsx` is the expensive part of this suite (a cold module cache
 * can take seconds per process), so each distinct CLI invocation runs
 * exactly once, up front, under a timeout sized for process start-up rather
 * than for an assertion. The cases below only read those results, which
 * keeps the suite deterministic without loosening a single expectation.
 */
const CLI_SPAWN_TIMEOUT_MS = 60_000;

describe("lint-cli", () => {
  let valid: CliRun;
  let broken: CliRun;
  let real: CliRun;

  beforeAll(() => {
    valid = runCli(fixtureDir("lint-valid-content"));
    broken = runCli(fixtureDir("lint-broken-content"));
    real = runCli(realContentDir);
  }, CLI_SPAWN_TIMEOUT_MS);

  it("exits 0 against a lint-clean content directory", () => {
    expect(valid.status).toBe(0);
  });

  it("exits non-zero against a directory with error-severity violations", () => {
    expect(broken.status).not.toBe(0);
  });

  it("prints the rule name, file path and entity id for a deliberately broken fixture", () => {
    expect(broken.output).toContain("citation-resolves");
    expect(broken.output).toContain("skills.json");
    expect(broken.output).toContain("typescript");
    expect(broken.output).toContain("tag-in-vocabulary");
    expect(broken.output).toContain("experience/fixture-role.json");
    expect(broken.output).toContain("fixture-role-fixtureco-2020");
  });

  it("prints the blocking story-preservation violations for the broken fixture (#290)", () => {
    expect(broken.output).toContain("story-preservation-map-resolves");
    expect(broken.output).toContain("story-preservation-map.json");
  });

  it("prints the unclassified highlight as a blocking completeness error for the broken fixture (#290)", () => {
    expect(broken.output).toContain("story-preservation-map-complete");
    expect(broken.output).toContain("fixture-role-fixtureco-2020#highlights.1");
  });

  it("prints the verbatim story-detail duplication as a blocking error for the broken fixture (#297)", () => {
    expect(broken.output).toContain("no-story-detail-in-experience");
    expect(broken.output).toContain("fixture-copied-story");
  });

  it("exits 0 against the real, authored content set", () => {
    expect(real.status).toBe(0);
    expect(real.output).toContain("lint passed");
  });
});
