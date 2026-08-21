/**
 * Mechanical enforcement of this package's own architecture boundary: agent
 * tools are thin adapters over `packages/core` — they must import the
 * domain function they wrap directly from `@hire-me-mcp/core`, and must
 * never import `@hire-me-mcp/career-data` (raw content) or reach around the
 * `CareerDataRepository` seam via the filesystem directly. See
 * `source-boundary.test.ts` for the real-file scan this backs, and
 * `packages/core/src/dependency-allowlist.ts` for the sibling pattern this
 * mirrors at the import-statement level instead of the package.json level.
 */

const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "@hire-me-mcp/career-data", pattern: /from\s*["']@hire-me-mcp\/career-data["']/ },
  { label: "node:fs", pattern: /from\s*["']node:fs["']/ },
  { label: "fs", pattern: /from\s*["']fs["']/ },
];

/**
 * Returns every forbidden import label found in `source`'s import
 * statements. Empty array means the source file stays within the
 * repository-seam boundary.
 */
export function findForbiddenImports(source: string): string[] {
  return FORBIDDEN_IMPORT_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
    ({ label }) => label,
  );
}

/**
 * True when `source` has a named import of `functionName` from
 * `@hire-me-mcp/core` — i.e. the tool module wraps the real domain function
 * rather than a local reimplementation or an import from anywhere else.
 */
export function importsCoreFunction(source: string, functionName: string): boolean {
  const importStatementPattern = /import\s*\{([^}]*)\}\s*from\s*["']@hire-me-mcp\/core["']/g;
  const namePattern = new RegExp(`(^|[\\s,{])${functionName}([\\s,}]|$)`);
  for (const match of source.matchAll(importStatementPattern)) {
    if (namePattern.test(match[1] ?? "")) {
      return true;
    }
  }
  return false;
}
