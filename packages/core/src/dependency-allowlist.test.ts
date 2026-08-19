import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findDisallowedDependencies } from "./dependency-allowlist.js";

function readJson(relPath: string): unknown {
  const absPath = fileURLToPath(new URL(relPath, import.meta.url));
  return JSON.parse(readFileSync(absPath, "utf-8"));
}

describe("findDisallowedDependencies", () => {
  it("returns no violations when every dependency is on the allowlist", () => {
    const violations = findDisallowedDependencies(
      { dependencies: { "@hire-me-mcp/career-data": "workspace:*" } },
      { dependencies: ["@hire-me-mcp/career-data"], devDependencies: [] },
    );
    expect(violations).toEqual([]);
  });

  it("flags a runtime dependency that is not on the allowlist", () => {
    const violations = findDisallowedDependencies(
      { dependencies: { react: "18.0.0" } },
      { dependencies: [], devDependencies: [] },
    );
    expect(violations).toEqual(["dependencies.react"]);
  });

  it("flags a devDependency that is not on the allowlist", () => {
    const violations = findDisallowedDependencies(
      { devDependencies: { eslint: "9.0.0" } },
      { dependencies: [], devDependencies: [] },
    );
    expect(violations).toEqual(["devDependencies.eslint"]);
  });

  it("reports every violation, not just the first", () => {
    const violations = findDisallowedDependencies(
      { dependencies: { react: "18.0.0", next: "15.0.0" } },
      { dependencies: [], devDependencies: [] },
    );
    expect(violations).toEqual(["dependencies.react", "dependencies.next"]);
  });

  it("treats missing dependencies/devDependencies fields as empty (no crash)", () => {
    expect(findDisallowedDependencies({}, { dependencies: [], devDependencies: [] })).toEqual([]);
  });

  it("mechanically enforces that packages/core's own package.json only depends on what allowed-dependencies.json permits", () => {
    const packageJson = readJson("../package.json") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allowlist = readJson("../allowed-dependencies.json") as {
      dependencies: string[];
      devDependencies: string[];
    };

    expect(findDisallowedDependencies(packageJson, allowlist)).toEqual([]);
  });
});
