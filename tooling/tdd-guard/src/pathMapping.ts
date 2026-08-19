/**
 * Source <-> test path mapping for the co-located `*.test.ts` / `*.test.tsx`
 * convention fixed in #13 (`src/foo.ts` -> `src/foo.test.ts`, and, because
 * apps/web puts its App Router source under `app/` rather than `src/`,
 * `app/foo.tsx` -> `app/foo.test.tsx`).
 *
 * All paths in this module are repo-relative, POSIX-style (`/` separated).
 */

export type PathKind = "source" | "test" | "other";

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;
const TEST_SUFFIXES = [".test.ts", ".test.tsx"] as const;

/** Directories (relative to a package root) that count as "source roots". */
const SOURCE_ROOT_SEGMENTS = ["src", "app"] as const;

/** File name patterns that are never considered "source" even under src/app. */
const NON_SOURCE_BASENAME_PATTERNS = [
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /^vitest\.config\./,
  /^next\.config\./,
];

function toPosix(filePath: string): string {
  return filePath.split("\\").join("/");
}

/** Strips a repo-root absolute prefix, if present, leaving a repo-relative path. */
export function toRepoRelative(filePath: string, repoRoot: string): string {
  const posixPath = toPosix(filePath);
  const posixRoot = toPosix(repoRoot).replace(/\/+$/, "");
  if (posixPath === posixRoot) return "";
  if (posixPath.startsWith(`${posixRoot}/`)) {
    return posixPath.slice(posixRoot.length + 1);
  }
  return posixPath.replace(/^\/+/, "");
}

function isTestSuffixed(basename: string): boolean {
  return TEST_SUFFIXES.some((suffix) => basename.endsWith(suffix));
}

function hasSourceExtension(basename: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => basename.endsWith(ext));
}

/**
 * Matches `apps/<name>/src/**\/*.ts(x)`, `apps/<name>/app/**\/*.ts(x)`,
 * and `packages/<name>/src/**\/*.ts(x)` — the globs called out in the issue,
 * extended to include `app/` because that's where apps/web's own source lives.
 */
function isUnderSourceRoot(repoRelativePath: string): boolean {
  const segments = repoRelativePath.split("/");
  if (segments.length < 4) return false;
  const [workspaceKind, , sourceRoot] = segments;
  if (workspaceKind !== "apps" && workspaceKind !== "packages") return false;
  return (
    sourceRoot !== undefined && (SOURCE_ROOT_SEGMENTS as readonly string[]).includes(sourceRoot)
  );
}

/** Classifies a repo-relative path as source, test, or other (config/docs/non-matching). */
export function classifyPath(repoRelativePath: string): PathKind {
  const posixPath = toPosix(repoRelativePath);
  const basename = posixPath.split("/").pop() ?? "";

  if (!hasSourceExtension(basename)) return "other";
  if (!isUnderSourceRoot(posixPath)) return "other";
  if (NON_SOURCE_BASENAME_PATTERNS.some((pattern) => pattern.test(basename))) return "other";
  if (isTestSuffixed(basename)) return "test";
  return "source";
}

/**
 * Maps a source file to its expected co-located test path, e.g.
 * `packages/core/src/index.ts` -> `packages/core/src/index.test.ts`,
 * `apps/web/app/page.tsx` -> `apps/web/app/page.test.tsx`.
 *
 * Returns null if `repoRelativePath` is not classified as "source".
 */
export function mapSourceToTest(repoRelativePath: string): string | null {
  const posixPath = toPosix(repoRelativePath);
  if (classifyPath(posixPath) !== "source") return null;

  const extension = SOURCE_EXTENSIONS.find((ext) => posixPath.endsWith(ext));
  if (!extension) return null;

  const stem = posixPath.slice(0, -extension.length);
  return `${stem}.test${extension}`;
}

/**
 * Maps a test file back to the source file it exercises, e.g.
 * `packages/core/src/index.test.ts` -> `packages/core/src/index.ts`.
 *
 * Returns null if `repoRelativePath` is not classified as "test".
 */
export function mapTestToSource(repoRelativePath: string): string | null {
  const posixPath = toPosix(repoRelativePath);
  if (classifyPath(posixPath) !== "test") return null;

  const suffix = TEST_SUFFIXES.find((s) => posixPath.endsWith(s));
  if (!suffix) return null;

  const extension = suffix.slice(".test".length); // ".ts" | ".tsx"
  const stem = posixPath.slice(0, -suffix.length);
  return `${stem}${extension}`;
}
