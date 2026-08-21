/**
 * The single `CareerDataRepository` instance this package's tools read
 * through. Package-local mirror of `apps/web/src/lib/content/repository.ts`
 * (there is no `server-only` runtime constraint here — this package is
 * plain, embedded TypeScript, not a Next.js app): `packages/core`'s
 * `createContentCareerDataRepository()` already memoizes `getDataset()`
 * internally, and this module additionally memoizes the *repository
 * construction* itself at module scope, so every tool in `src/tools/`
 * shares one repository instance instead of each paying its own first-read
 * cost.
 */

import { type CareerDataRepository, createContentCareerDataRepository } from "@hire-me-mcp/core";

let cachedRepository: CareerDataRepository | undefined;

/** Returns the shared, memoized {@link CareerDataRepository} for real content. */
export function getAgentCareerDataRepository(): CareerDataRepository {
  cachedRepository ??= createContentCareerDataRepository();
  return cachedRepository;
}
