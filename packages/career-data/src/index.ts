/**
 * Zod-typed career content package: schemas, a content loader/validator,
 * and this public entry point, which is the only surface `packages/core`
 * (and any other workspace consumer) is allowed to import from — never a
 * deep `dist/...` or `src/...` path.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Name of this package, exported as a trivial placeholder value. */
export const CAREER_DATA_PACKAGE_NAME = "@hire-me-mcp/career-data";

/**
 * Directory-existence + marker-file check used to accept a candidate as
 * "the real content directory" — not just an existing directory. Requiring
 * `profile.json` specifically (rather than any directory named `content`)
 * avoids a false-positive match against some unrelated directory that
 * happens to sit at the same cwd-relative offset in a layout we didn't
 * anticipate.
 */
function isContentDir(candidate: string): boolean {
  return existsSync(candidate) && existsSync(path.join(candidate, "profile.json"));
}

/**
 * Every path this package's own `content/` directory could sit at,
 * depending on how the current process was invoked — see
 * {@link resolveDefaultContentDir}'s docstring for why more than one
 * candidate is necessary and what each one covers.
 */
function candidateContentDirs(): string[] {
  const cwd = process.cwd();
  const candidates = [
    // Vercel Lambda runtime (and `next dev`/`next start` from apps/web):
    // cwd is the Next.js app's own root directory (this repo's Vercel
    // "Root Directory" is `apps/web` — see README's Deployment section),
    // two levels above the monorepo root.
    path.join(cwd, "..", "..", "packages", "career-data", "content"),
    // Invoked from the monorepo root (e.g. a script run without pnpm's
    // usual per-package cwd, or a differently configured Root Directory).
    path.join(cwd, "packages", "career-data", "content"),
    // Invoked from this package's own directory (pnpm/turbo always run a
    // package's scripts with cwd set to that package — this is the common
    // case for `packages/career-data`'s own tests and CLI scripts).
    path.join(cwd, "content"),
    // Invoked from one level inside this package (e.g. `dist/` or `src/`).
    path.join(cwd, "..", "content"),
  ];

  // Legacy fallback: resolve relative to this module's own compiled/source
  // location. This is the *only* mechanism that existed before #113 and
  // still helps for direct, unbundled invocations (`tsx`/Vitest importing
  // this module straight from disk) with a cwd that doesn't match any
  // candidate above. It must not be relied on alone: when Next.js bundles
  // this package into a webpack chunk for `/api/mcp` (workspace packages
  // get inlined into the route's server bundle rather than kept as
  // external `require()`s), webpack replaces `import.meta.url` with a
  // *string literal* — this module's absolute path on the machine that ran
  // `next build` — frozen at build time. On Vercel, the build runs in one
  // container and the deployed Lambda runs in a separate one with its own
  // filesystem, so that frozen path does not exist at runtime: the
  // directory silently "isn't there," and every entity type loads as
  // empty (confirmed via a local sandbox reproduction — copy exactly the
  // route's `.nft.json`-traced files into a fresh directory and check the
  // frozen path against it: absent). `process.cwd()`, unlike
  // `import.meta.url`, is evaluated at runtime and is never rewritten by a
  // bundler, which is why every candidate above is cwd-based and tried
  // first.
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(moduleDir, "..", "content"));
  } catch {
    // import.meta.url is always defined in practice; this guards against a
    // theoretical bundling mode where resolving it throws outright rather
    // than just freezing to a stale value.
  }

  return candidates;
}

/**
 * Absolute path to this package's own `content/` directory — the default
 * data source for {@link loadContentDir}. See {@link candidateContentDirs}
 * for the full list of layouts this probes, in priority order, and why a
 * single `import.meta.url`-relative resolution (the pre-#113 approach) is
 * not layout-robust once this package is bundled by webpack.
 *
 * Throws — rather than returning a path that doesn't exist — when none of
 * the candidates resolve, naming every path attempted: a caller silently
 * getting an empty dataset from a wrong-but-plausible-looking path is
 * exactly the failure mode (#113) this function exists to prevent.
 */
export function resolveDefaultContentDir(): string {
  const candidates = candidateContentDirs();
  const match = candidates.find(isContentDir);
  if (match !== undefined) {
    return match;
  }

  throw new Error(
    "@hire-me-mcp/career-data: could not locate the content/ directory from any known " +
      `runtime layout (cwd=${process.cwd()}). Tried:\n` +
      candidates.map((candidate) => `  - ${candidate}`).join("\n") +
      "\nThis usually means resolveDefaultContentDir()'s cwd-relative assumptions don't " +
      "match the current runtime's file layout — see its docstring and " +
      "candidateContentDirs() in src/index.ts.",
  );
}

export type {
  CareerDataset,
  CareerDatasetWithSources,
  ContentValidationError,
  EntitySource,
} from "./content/loader.js";
export {
  hasStoryPreservationMap,
  loadContentDir,
  loadContentDirWithSources,
  loadStoryPreservationMap,
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
