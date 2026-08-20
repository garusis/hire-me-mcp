/**
 * The content-correctness spot checks' data source (#58).
 *
 * Deliberately imports `@hire-me-mcp/core` directly — never `apps/web/src/lib/content`
 * (the barrel every page component reads through, guarded by `server-only`
 * and unimportable from a plain Node/Playwright test process anyway) — so
 * these assertions are a genuinely independent second reader of
 * `packages/career-data`'s content. If a page component hardcodes or edits
 * copy instead of rendering what the content layer returns, this dataset
 * still reflects the real authored value and the corresponding
 * `content-correctness.spec.ts` assertion fails.
 *
 * Only `@hire-me-mcp/core` is imported (never `@hire-me-mcp/career-data`
 * directly) so this file stays inside the same import boundary Biome
 * enforces for the rest of `apps/web` (`noRestrictedImports`, scoped to
 * `apps/web/**` outside `src/lib/content/`) — `core` re-exports everything
 * needed: the repository factory, the domain services, and `slugify`.
 */

import {
  createContentCareerDataRepository,
  getExperience,
  getProfile,
  slugify,
} from "@hire-me-mcp/core";

const repository = createContentCareerDataRepository();

/** The full validated dataset, read once per test process (the repository memoizes internally). */
export const dataset = repository.getDataset();

/** Same "who is this" record `apps/web/src/lib/content/profile.ts` wraps for every page. */
export const profile = getProfile(repository).data;

/** Same reverse-chronological order `apps/web/src/lib/content/experience.ts` exposes to `/experience` and the home page. */
export const experience = getExperience(repository).data;

/** Route slug for a career-data entity id — the same derivation `toSlug()` (`apps/web/src/lib/content/slug.ts`) uses. */
export { slugify };
