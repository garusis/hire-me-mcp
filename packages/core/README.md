# `@hire-me-mcp/core`

The framework-free domain layer. This is the spine every later domain service (`getProfile`,
`getExperience`, `searchProjects`, `getSkillEvidence`, ...) hangs on, and it is consumed by
`apps/web` today and the future public MCP endpoint (#3) and chat agent (#5) — none of which are
Next.js-shaped by the time they reach here.

## What this package is

- **The response envelope.** `DomainResult<T>` (`{ data, citations }`) is the shape every domain
  service returns. `Citation` is re-exported from `@hire-me-mcp/career-data` so this is the only
  place downstream code needs to import it from. See `src/result.ts`.
- **The repository seam.** `CareerDataRepository` is the single interface services read career
  data through. `createContentCareerDataRepository()` is the default, content-backed
  implementation — it loads via `@hire-me-mcp/career-data`'s `loadContentDir()`, eagerly on first
  access, and memoizes (the content directory is read at most once).
  `createInMemoryCareerDataRepository()` wraps an already-built dataset for tests, with **no
  filesystem access at all**. See `src/repository.ts`.
- **The citation-building helper.** `buildCitation(repository, entityType, entityId, options)`
  resolves an id against the repository's dataset and returns a `Citation`, deriving a
  human-readable label per entity type. It throws `UnknownEntityError` — naming the type and id —
  rather than building a citation that points at nothing. See `src/citation-builder.ts`.

No individual query service (`getProfile`, `searchProjects`, ...) ships from this package yet —
that's #54/#55/#56. This package only provides what they'll all be built on.

## The framework-free boundary — what may and may not be imported

**Locked decision:** `packages/core` never imports React, Next.js, or any HTTP-framework/Node-only
server API. Anything that only makes sense inside a specific runtime (React components, Next.js
route handlers, an HTTP server) belongs in `apps/web`, not here — this package is consumed by
`apps/web` today, and by the MCP endpoint and chat agent later, so it can't assume either runtime.

This is enforced two ways, not by convention:

1. **Import-level, via Biome.** `biome.json` has an override scoped to `packages/core/src/**` that
   turns on `lint/style/noRestrictedImports`, forbidding `react`, `react-dom`, `next` (and their
   subpaths), `express`, `fastify`, `koa`, and `node:http`/`node:https`. Adding one of these
   imports fails `pnpm lint`.

   ```ts
   // packages/core/src/whatever.ts
   import { useState } from "react"; // fails: lint/style/noRestrictedImports
   ```

2. **Dependency-level, via an explicit allowlist.** `allowed-dependencies.json` (this directory)
   is the complete, explicit, hand-edited list of package names `packages/core/package.json` may
   declare under `dependencies` and `devDependencies`. `src/dependency-allowlist.test.ts` reads
   both files and fails if `package.json` has gained anything not on the list — so an
   `npm install`/`pnpm add` that isn't also reflected here breaks the test suite, not just lint.

   Today the list is intentionally small: `@hire-me-mcp/career-data` (the one data source) plus
   the shared build/test tooling (`typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`).

### This list will grow — on purpose

**#34** (epic #6, the RAG/embeddings work) is expected to deliberately extend
`allowed-dependencies.json` with a vector-DB or embedding-client dependency once that epic lands —
that is the intended way to evolve this boundary. The allowlist exists to make that decision
visible and reviewable in a diff, not to freeze `packages/core` forever. If you're adding a
dependency here: edit `allowed-dependencies.json` in the same PR, and explain why in the PR
description — don't work around the check.

What should never be added, regardless of the allowlist: `react`, `next`, or any HTTP-framework
package. Biome's `noRestrictedImports` override exists specifically because the dependency
allowlist alone wouldn't stop someone from importing a *transitive* framework dependency that
another allowed package happens to pull in.

## Testing conventions specific to this package

- Every test that exercises `createContentCareerDataRepository()` against real content passes an
  explicit `contentDir` pointing at a fixture directory (see `packages/career-data`'s
  `__fixtures__/`) — never the real, evolving `packages/career-data/content/`.
- Tests for anything built on top of `CareerDataRepository` should use
  `createInMemoryCareerDataRepository()` with a hand-built fixture dataset (`emptyCareerDataset()`
  spread + overrides), not the content-backed implementation — that's the whole point of the seam.
