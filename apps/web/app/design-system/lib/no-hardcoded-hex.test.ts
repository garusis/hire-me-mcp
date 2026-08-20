import { globSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// app/design-system/lib -> apps/web
const APP_ROOT = join(HERE, "..", "..");

// Raw 3/4/6/8-digit hex colours, e.g. #fff, #1c1a17, #ffffffcc.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

/**
 * Guards the AC "a lint or unit-level check fails if a primitive hardcodes
 * a raw hex colour instead of a token": scans every component style file
 * (CSS Modules) and TS/TSX source under the design system for a raw hex
 * literal. `globals.css` is the token source of truth and is intentionally
 * excluded — that's the one place hex values are allowed to live.
 */
function findOffenders(): string[] {
  const patterns = ["**/*.module.css", "**/*.tsx", "**/*.ts"];
  const offenders: string[] = [];

  for (const pattern of patterns) {
    const files = globSync(pattern, { cwd: APP_ROOT });
    for (const file of files) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
        continue;
      }
      const fullPath = join(APP_ROOT, file);
      const content = readFileSync(fullPath, "utf-8");
      if (HEX_COLOR.test(content)) {
        offenders.push(relative(APP_ROOT, fullPath));
      }
    }
  }

  return offenders;
}

describe("no hardcoded hex colours in the design system", () => {
  it("finds no raw hex colour literals outside the token definitions", () => {
    expect(findOffenders()).toEqual([]);
  });
});
