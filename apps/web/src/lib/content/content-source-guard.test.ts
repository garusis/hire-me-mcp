/**
 * Mechanical enforcement of the issue #16 architecture rule: `apps/web` has
 * exactly one server-side path to career content — this content layer. No
 * page, component, or other module in `apps/web` may import
 * `@hire-me-mcp/career-data` directly; every read goes through
 * `packages/core`'s domain services, via this directory.
 *
 * This is deliberately a Vitest test, not just the Biome
 * `noRestrictedImports` override in `biome.json` — the two are redundant on
 * purpose: `pnpm test` (this file) and `pnpm lint` (Biome) both fail
 * independently on a regression, so the rule survives even if one of the
 * two checks is skipped in a given workflow. The heuristic is intentionally
 * narrow and documented: a source-text scan for the forbidden import
 * specifier across every non-test `.ts`/`.tsx` file in `apps/web/app/**`
 * and `apps/web/src/**`, excluding this directory itself.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORBIDDEN_IMPORT_SPECIFIER = "@hire-me-mcp/career-data";
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".next", ".turbo"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const TEST_SUFFIXES = [".test.ts", ".test.tsx"];

const CONTENT_LAYER_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(CONTENT_LAYER_DIR, "..", "..", "..");
const SCAN_ROOTS = ["app", "src"].map((segment) => join(WEB_ROOT, segment));

function isSourceFile(basename: string): boolean {
  return (
    SOURCE_EXTENSIONS.some((ext) => basename.endsWith(ext)) &&
    !TEST_SUFFIXES.some((suffix) => basename.endsWith(suffix))
  );
}

function collectSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry)) {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (isSourceFile(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isInsideContentLayer(filePath: string): boolean {
  const relativeToContentLayer = relative(CONTENT_LAYER_DIR, filePath);
  return !relativeToContentLayer.startsWith("..");
}

describe("content-source guard", () => {
  it(`forbids importing "${FORBIDDEN_IMPORT_SPECIFIER}" anywhere in apps/web outside src/lib/content/`, () => {
    const offendingFiles: string[] = [];

    for (const scanRoot of SCAN_ROOTS) {
      for (const file of collectSourceFiles(scanRoot)) {
        if (isInsideContentLayer(file)) {
          continue;
        }
        const contents = readFileSync(file, "utf8");
        if (contents.includes(FORBIDDEN_IMPORT_SPECIFIER)) {
          offendingFiles.push(relative(WEB_ROOT, file));
        }
      }
    }

    expect(offendingFiles).toEqual([]);
  });

  it("scans at least one real file outside the content layer, so the check above isn't vacuously passing", () => {
    const scannedOutsideContentLayer = SCAN_ROOTS.flatMap((root) =>
      collectSourceFiles(root),
    ).filter((file) => !isInsideContentLayer(file));

    expect(scannedOutsideContentLayer.length).toBeGreaterThan(0);
  });
});
