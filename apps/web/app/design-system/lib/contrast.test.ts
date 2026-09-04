import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// app/design-system/lib -> apps/web
const APP_ROOT = join(HERE, "..", "..");
const GLOBALS_CSS = readFileSync(join(APP_ROOT, "globals.css"), "utf-8");

/**
 * Pulls a `--token: #hex;` value out of one `:root { ... }` block (light)
 * or `:root[data-theme="dark"] { ... }` block (dark) of `globals.css` — the
 * single source of truth for the palette, so this check reads exactly what
 * ships rather than a copy that can drift.
 */
function tokenValue(theme: "light" | "dark", token: string): string {
  const blockPattern =
    theme === "light"
      ? /:root\s*\{([\s\S]*?)\n\}/
      : /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/;
  const block = blockPattern.exec(GLOBALS_CSS);
  const blockBody = block?.[1];
  if (blockBody === undefined) {
    throw new Error(`Could not find the :root block for theme "${theme}" in globals.css`);
  }
  const tokenPattern = new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{3,8})`);
  const match = tokenPattern.exec(blockBody);
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`Could not find --${token} in the ${theme} :root block of globals.css`);
  }
  return value;
}

/** Text/UI pairs an AA-conscious palette must clear at 4.5:1 (issue 308). */
const PAIRS: Array<[string, string]> = [
  ["color-fg", "color-bg"],
  ["color-fg-muted", "color-bg"],
  ["color-accent-fg", "color-accent"],
  ["color-highlight", "color-highlight-soft"],
];

describe("contrastRatio", () => {
  it("computes the maximum ratio (21:1) for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("computes a ratio of 1 for identical colors", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric — the pair order doesn't matter", () => {
    expect(contrastRatio("#111111", "#eeeeee")).toBeCloseTo(contrastRatio("#eeeeee", "#111111"), 5);
  });
});

describe("globals.css palette contrast (WCAG AA, issue 308)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [fgToken, bgToken] of PAIRS) {
      it(`${theme}: --${fgToken} on --${bgToken} clears 4.5:1`, () => {
        const fg = tokenValue(theme, fgToken);
        const bg = tokenValue(theme, bgToken);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
