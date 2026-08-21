/**
 * Convert arbitrary text into a URL-safe slug: lowercased, trimmed,
 * non-alphanumeric runs collapsed to a single hyphen, no leading/trailing
 * hyphens.
 *
 * Deliberately its own leaf module rather than living inline in `index.ts`
 * (where it originated): a pure, dependency-free function, kept separate
 * so `@hire-me-mcp/core/slugify` (see `package.json`'s `exports` map) can
 * be imported without pulling in `repository.ts`'s `node:fs`/`node:path`
 * dependency — see `slugify.test.ts`'s doc comment for why that boundary
 * matters.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
