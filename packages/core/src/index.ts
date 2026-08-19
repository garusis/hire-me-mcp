/**
 * Framework-free domain layer.
 *
 * This package must never depend on React, Next.js, or any HTTP framework —
 * it is consumed by both the web app and the future public MCP endpoint.
 */

/** Name of this package, exported as a trivial placeholder value. */
export const CORE_PACKAGE_NAME = "@hire-me-mcp/core";

/**
 * Convert arbitrary text into a URL-safe slug: lowercased, trimmed,
 * non-alphanumeric runs collapsed to a single hyphen, no leading/trailing
 * hyphens.
 *
 * A small but real piece of domain-agnostic logic — used to prove the
 * Vitest pipeline exercises actual exported behavior, not a placeholder.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
