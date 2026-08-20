/**
 * The single `CareerDataRepository` instance the content layer reads
 * through. `packages/core`'s `createContentCareerDataRepository()` already
 * memoizes `getDataset()` internally (loads on first access, never
 * re-reads), so this module additionally memoizes the *repository
 * construction* itself at module scope, so every accessor in
 * `src/lib/content/` shares one repository instance instead of each paying
 * its own first-read cost.
 *
 * Deliberately a plain module-level singleton rather than `React.cache`:
 * the career-data content this reads is static and identical across every
 * request/page in a build (there is no per-request/per-user variance to
 * dedupe), so a cache scoped to a single render/request would still incur
 * a fresh `loadContentDir()` per static page. A module singleton holds for
 * the whole build process, which is the actually-correct memoization
 * boundary for build-time-static content, and — unlike `React.cache`,
 * whose memoization only applies inside an active render — it is directly
 * observable and unit-testable outside of one (see `repository.test.ts`).
 */

import "server-only";
import { type CareerDataRepository, createContentCareerDataRepository } from "@hire-me-mcp/core";

let cachedRepository: CareerDataRepository | undefined;

/** Returns the shared, memoized {@link CareerDataRepository} for real content. */
export function getCareerDataRepository(): CareerDataRepository {
  cachedRepository ??= createContentCareerDataRepository();
  return cachedRepository;
}
