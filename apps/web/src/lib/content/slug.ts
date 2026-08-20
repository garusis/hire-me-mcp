/**
 * Slug derivation and lookup helpers shared by every content accessor's
 * list/detail pair and by `generateStaticParams`. Career-data entity ids are
 * already validated kebab-case (`packages/career-data`'s `idSchema`), so
 * `toSlug` is idempotent on real content today — it's kept as an explicit,
 * documented derivation step (rather than using `entry.id` directly)
 * so a future id format change can't silently produce unsafe route
 * segments.
 */

import { slugify } from "@hire-me-mcp/core";

/** Derives a stable, URL-safe slug from a career-data entity's own `id`. */
export function toSlug(id: string): string {
  return slugify(id);
}

/** A slug that resolved to a real item. */
export interface FoundBySlug<T> {
  found: true;
  slug: string;
  value: T;
}

/**
 * The documented not-found result: a slug that resolved to nothing. Every
 * detail accessor returns this instead of throwing for an unrecognized
 * slug, so route handlers/`notFound()` callers can branch on `found` rather
 * than catching an exception.
 */
export interface NotFoundBySlug {
  found: false;
  slug: string;
}

export type SlugLookup<T> = FoundBySlug<T> | NotFoundBySlug;

/**
 * Looks `slug` up against `items` by deriving each item's slug via `getId`
 * + {@link toSlug}. Returns the documented {@link NotFoundBySlug} result —
 * never throws — when nothing matches.
 */
export function findBySlug<T>(
  items: readonly T[],
  slug: string,
  getId: (item: T) => string,
): SlugLookup<T> {
  const value = items.find((item) => toSlug(getId(item)) === slug);
  return value === undefined ? { found: false, slug } : { found: true, slug, value };
}

/** Every item's slug, in the same order as `items` — for `generateStaticParams`. */
export function listSlugs<T>(items: readonly T[], getId: (item: T) => string): string[] {
  return items.map((item) => toSlug(getId(item)));
}
