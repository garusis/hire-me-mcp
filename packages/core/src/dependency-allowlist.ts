/**
 * Mechanical enforcement of `packages/core`'s framework-free boundary at the
 * `package.json` level: no dependency can be added — runtime or dev — unless
 * it is named in `allowed-dependencies.json`, sitting alongside this file's
 * package root. See the package README for what is (and is not) on the list
 * and why.
 */

/** The explicit, editable set of dependency names `packages/core` may declare. */
export interface DependencyAllowlist {
  dependencies: string[];
  devDependencies: string[];
}

interface DependencyManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Compares a `package.json`-shaped manifest's `dependencies`/`devDependencies`
 * against an allowlist, returning one `"dependencies.<name>"` or
 * `"devDependencies.<name>"` entry per disallowed package. Empty array means
 * every declared dependency is permitted.
 */
export function findDisallowedDependencies(
  manifest: DependencyManifest,
  allowlist: DependencyAllowlist,
): string[] {
  const violations: string[] = [];
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!allowlist.dependencies.includes(name)) {
      violations.push(`dependencies.${name}`);
    }
  }
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    if (!allowlist.devDependencies.includes(name)) {
      violations.push(`devDependencies.${name}`);
    }
  }
  return violations;
}
