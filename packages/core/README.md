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

- **The domain services.** `getProfile()` and `getExperience(filter?)` (#54) are the first two
  query services built on the spine above. `searchProjects` and `getSkillEvidence` (#55/#56) will
  follow the same shape. See "Domain services" below for their signatures and documented
  semantics.

## Domain services

Every domain service takes a `CareerDataRepository` and returns a `DomainResult<T>` — never
throws for "no results", only for genuinely exceptional input (see each service below). See
`src/get-profile.ts` and `src/get-experience.ts`.

### `getProfile(repository: CareerDataRepository): DomainResult<Profile>`

Returns the singleton `Profile` record from the repository's dataset, with a citation resolving
to it (`citations` always has exactly one entry). Throws `ProfileNotFoundError` if the dataset has
no profile authored — this is the one case where the service throws rather than returning an
"empty" result, because there is no meaningful empty `Profile`.

### `getExperience(repository: CareerDataRepository, filter?: ExperienceFilter): DomainResult<ExperienceEntry[]>`

Returns every `ExperienceEntry` matching `filter` (all entries if `filter` is omitted), sorted per
the stable order below, each with a citation resolving to it (`citations[i]` always corresponds to
`data[i]`). A filter matching nothing returns `{ data: [], citations: [] }` — never throws.

`ExperienceFilter` fields:

- `company?: string` — exact match against `ExperienceEntry.company`, case-insensitive (still
  exact matching, never fuzzy).
- `tech?: string[]` — matches an entry if it has **any** of the given tags in its `tech` array
  (OR within this field). Tags are matched as opaque strings against the controlled vocabulary
  defined by `@hire-me-mcp/career-data`'s `TECH_TAGS`; the filter itself does not validate that a
  given tag is a known one. An empty array imposes no constraint, same as omitting the field.
- `from?: string`, `to?: string` — inclusive `YYYY-MM` bounds of a date-range **overlap** check
  against an entry's `[startDate, endDate]` span (not "starts within range" — an entry that merely
  overlaps the given range matches). A role with no `endDate` (a current role, per #48's
  "current role" representation) is treated as open-ended/still-ongoing, so it overlaps any range
  that reaches into the present. Omitting `from` and/or `to` leaves that bound open.
- `status?: "current" | "past"` — `"current"` restricts to the entry/entries with no `endDate`;
  `"past"` restricts to entries that have one. Omitted imposes no constraint.

**Filter combination semantics:** every field present on the filter must match — **AND across
fields**. Within `tech`, a match against **any** listed tag is enough — **OR within that
multi-value field**. There is no cross-field OR.

**Stable sort order:** reverse-chronological by `startDate` (most recent first). Ties (identical
`startDate`) are broken by `endDate` descending — an open-ended (current) role sorts first among
same-start ties, ahead of one that has since ended. Any remaining tie is broken by `id` ascending,
so the order is fully deterministic regardless of the input array's order.

No individual query service beyond these two ships from this package yet — `searchProjects` and
`getSkillEvidence` are #55/#56.

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
