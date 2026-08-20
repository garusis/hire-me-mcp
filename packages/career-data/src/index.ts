/**
 * Zod-typed career content package: schemas, a content loader/validator,
 * and this public entry point, which is the only surface `packages/core`
 * (and any other workspace consumer) is allowed to import from — never a
 * deep `dist/...` or `src/...` path.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Name of this package, exported as a trivial placeholder value. */
export const CAREER_DATA_PACKAGE_NAME = "@hire-me-mcp/career-data";

/**
 * Absolute path to this package's own `content/` directory — the default
 * data source for {@link loadContentDir}. Resolved relative to this module
 * (works identically from `src/index.ts` under Vitest/tsx and from
 * `dist/index.js` after build, since both sit one level inside the package
 * root, alongside `content/`).
 *
 * Deliberately built with `node:path` rather than `new URL("../content",
 * import.meta.url)`: bundlers (webpack, via Next.js) statically detect that
 * literal `new URL(..., import.meta.url)` pattern and try to resolve it as
 * a bundled asset, which fails at build time for a directory that isn't a
 * module. This form is opaque to that static analysis.
 */
export function resolveDefaultContentDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "..", "content");
}

export type {
  CareerDataset,
  CareerDatasetWithSources,
  ContentValidationError,
  EntitySource,
} from "./content/loader.js";
export {
  loadContentDir,
  loadContentDirWithSources,
  validateContentDir,
} from "./content/loader.js";
export type {
  LintContext,
  LintResult,
  LintRule,
  LintSeverity,
  LintViolation,
} from "./lint.js";
export { ALL_RULES, formatLintReport, runLint } from "./lint.js";
export * from "./schemas/index.js";
export type { ValidateResult } from "./validate.js";
export { formatValidationReport, runValidate } from "./validate.js";

/**
 * Format a career-history year range as displayable text, e.g. `2021 – Present`
 * or `2019 – 2021`. `end` omitted (or `undefined`) means the role is current.
 *
 * A small but real piece of domain logic — used to prove the Vitest pipeline
 * exercises actual exported behavior, ahead of the real schemas landing in #2.
 */
export function formatYearRange(start: number, end?: number): string {
  if (!Number.isInteger(start)) {
    throw new RangeError(`start must be an integer year, got ${start}`);
  }
  if (end !== undefined) {
    if (!Number.isInteger(end)) {
      throw new RangeError(`end must be an integer year, got ${end}`);
    }
    if (end < start) {
      throw new RangeError(`end (${end}) must not be before start (${start})`);
    }
  }

  return `${start} – ${end === undefined ? "Present" : end}`;
}
