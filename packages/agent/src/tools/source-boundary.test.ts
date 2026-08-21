import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findForbiddenImports, importsCoreFunction } from "./source-boundary.js";

describe("importsCoreFunction", () => {
  it("finds a named import of the given function from @hire-me-mcp/core", () => {
    const source = 'import { getProfile } from "@hire-me-mcp/core";';

    expect(importsCoreFunction(source, "getProfile")).toBe(true);
  });

  it("finds the function among several named imports", () => {
    const source = 'import { type ExperienceFilter, getExperience } from "@hire-me-mcp/core";';

    expect(importsCoreFunction(source, "getExperience")).toBe(true);
  });

  it("returns false when the function is not imported from @hire-me-mcp/core", () => {
    const source = 'import { getProfile } from "./local-reimplementation.js";';

    expect(importsCoreFunction(source, "getProfile")).toBe(false);
  });

  it("returns false when a different function is imported from @hire-me-mcp/core", () => {
    const source = 'import { getExperience } from "@hire-me-mcp/core";';

    expect(importsCoreFunction(source, "getProfile")).toBe(false);
  });
});

describe("findForbiddenImports", () => {
  it("flags a direct import of @hire-me-mcp/career-data", () => {
    const source = 'import { loadContentDir } from "@hire-me-mcp/career-data";';

    expect(findForbiddenImports(source)).toContain("@hire-me-mcp/career-data");
  });

  it("flags a direct node:fs import (bypassing the repository seam)", () => {
    const source = 'import { readFileSync } from "node:fs";';

    expect(findForbiddenImports(source)).toContain("node:fs");
  });

  it("flags the unprefixed fs import too", () => {
    const source = 'import fs from "fs";';

    expect(findForbiddenImports(source)).toContain("fs");
  });

  it("returns no violations for a source file with none of the forbidden imports", () => {
    const source = 'import { getProfile } from "@hire-me-mcp/core";\nimport { z } from "zod";';

    expect(findForbiddenImports(source)).toEqual([]);
  });
});

/**
 * Mechanical enforcement, mirroring `packages/core`'s
 * `dependency-allowlist.test.ts`: reads every real `.ts` file under this
 * package's `src/`, not a hand-picked sample, so a new file added later is
 * covered automatically.
 */
describe("packages/agent source boundary (mechanical enforcement)", () => {
  const srcDir = fileURLToPath(new URL("../", import.meta.url));

  function collectTsFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const entryPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        return collectTsFiles(entryPath);
      }
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [entryPath] : [];
    });
  }

  it("no source file in packages/agent/src imports raw career-data or bypasses the repository seam", () => {
    const files = collectTsFiles(srcDir);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const forbidden of findForbiddenImports(source)) {
        violations.push(`${file}: ${forbidden}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("every domain-service tool module imports its wrapped function from @hire-me-mcp/core", () => {
    const expectations: Array<[file: string, fn: string]> = [
      ["get-profile.ts", "getProfile"],
      ["get-experience.ts", "getExperience"],
      ["search-projects.ts", "searchProjects"],
      ["get-skill-evidence.ts", "getSkillEvidence"],
    ];
    for (const [file, fn] of expectations) {
      const source = readFileSync(`${srcDir}/tools/${file}`, "utf-8");
      expect(importsCoreFunction(source, fn)).toBe(true);
    }
  });
});
