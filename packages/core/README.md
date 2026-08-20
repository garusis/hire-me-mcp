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

- **The domain services.** `getProfile()` and `getExperience(filter?)` (#54), and now
  `searchProjects(query, options?)` (#55), are the query services built on the spine above.
  `getSkillEvidence` (#56) will follow the same shape and reuse `searchProjects`'s underlying search
  module. See "Domain services" below for their signatures and documented semantics.

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

### `searchProjects(repository: CareerDataRepository, query: string, options?: SearchProjectsOptions): DomainResult<ProjectSearchResult[]>`

Deterministic keyword/tag search over the repository's `Project` entries — **no embeddings, no
randomness, no semantic ranking** (that's epic #6, deliberately out of scope here). The same query
against the same dataset always ranks the same way; see "Determinism" below.

Each `ProjectSearchResult` is `{ project, score, matches }`: the matched `Project`, its integer
score, and `matches: MatchExplanation[]` — the machine-readable `{ field, token }` pairs that
produced the score, so a caller (the MCP server in #3, the chat agent in #5) can explain *why* a
result matched instead of just asserting that it did.

**The scoring rule.** `query` is normalized and tokenized (case folding, punctuation stripping —
surrounding and internal, except hyphens are preserved so kebab-case tags like `openai-api` stay
one token — diacritic stripping, so Spanish accents like "diseño" fold to "diseno", and whitespace
collapsing; see `src/search/normalize.ts`). Each token is additionally resolved against a
controlled-vocabulary alias index built from the dataset's `skills` (`skill.id` doubles as the
canonical `TECH_TAGS` value; `skill.name` and `skill.aliases` are its alternate spellings), so a
query naming an alias (`"ts"`, `"postgres"`) matches the same projects its canonical tag
(`"typescript"`, `"postgresql"`) would.

A project is scored against four fields, each with a fixed weight — **exact tag match outweighs a
name match, which outweighs a summary match, which outweighs a body match**:

| Field     | Weight | What's compared                                             |
| --------- | -----: | ------------------------------------------------------------- |
| `tag`     |    100 | `Project.tech` — exact match against a (possibly alias-resolved) query token |
| `name`    |     50 | `Project.name`, tokenized                                     |
| `summary` |     20 | `Project.summary`, tokenized                                  |
| `body`    |      5 | `Project.body` (the MDX prose), tokenized                     |

For every field, for every *distinct* query token that field's token list contains, the field's
weight is added to the project's score **once** — repeating a word within a field does not inflate
its contribution. A project's total score is the sum across every matching (field, token) pair; a
project matching on multiple fields and/or multiple tokens scores higher than one matching on a
single field/token. Projects with a score of `0` (no field matched anything) are excluded from the
results entirely.

**Tie-breaker:** equally-scored projects are ordered by `id` ascending — the same "stable id
ordering" convention `getExperience` uses for its own ties — so ranking never depends on dataset
input order.

**Determinism:** scores are an integer sum of fixed weights; there is no floating-point ranking, no
randomness, and no dependency on wall-clock time or iteration order beyond what's documented above.
The same query against the same dataset, run any number of times, returns byte-identical results.

`SearchProjectsOptions`:

- `limit?: number` — maximum results to return, applied **after** ranking as a truncation; it never
  changes the relative order of the results kept.
- `tags?: string[]` — pre-filters candidate projects to those with **at least one** of the given
  tags (OR semantics across the list, the same convention as `getExperience`'s `tech` filter)
  before scoring. Each given tag is resolved through the same skill-alias index the query itself
  goes through, so `tags: ["postgres"]` and `tags: ["postgresql"]` pre-filter identically. Omitted
  or an empty array imposes no constraint.

An empty/whitespace-only `query`, or a `query` that matches nothing, returns
`{ data: [], citations: [] }` — never throws. Every returned result carries a citation resolving to
its `Project` (`citations[i]` corresponds to `data[i]`).

### The reusable `./search/` module

`searchProjects` is built on a search module (`src/search/`) that is deliberately kept separate and
domain-agnostic, because #56 (`getSkillEvidence`) is expected to reuse it unchanged for skill/gap
lookup, and epic #6 (semantic/vector retrieval) will sit alongside it rather than replace it. Its
own unit tests (`src/search/*.test.ts`) exercise it independently of `searchProjects`. Exported from
this package's entry point alongside the domain services:

- **`tokenize(value: string): string[]`** and **`normalizeTerm(value: string): string`**
  (`src/search/normalize.ts`) — the shared normalization pipeline described above. `tokenize` splits
  free text into normalized word tokens (stopwords removed); `normalizeTerm` normalizes a whole term
  (single- or multi-word) into one comparable, space-joined string, for alias/name lookup.
- **`buildAliasIndex(entries: AliasedEntry[]): AliasIndex`** (`src/search/alias-resolver.ts`) —
  generic alias/vocabulary resolution: given an arbitrary collection of
  `{ canonical: string, aliases: string[] }` entries, `index.resolve(term)` resolves any spelling —
  the canonical value or one of its aliases, in any casing/punctuation/diacritic form — back to the
  canonical value, or `undefined` if nothing matches. Not hardcoded to projects or tags — #56 is
  expected to build a second index straight from skill/gap collections, unchanged.
- **`search(documents: SearchDocument[], queryTokens: string[], options?: SearchOptions): SearchMatch[]`**
  (`src/search/engine.ts`) — the generic scoring engine described above, parameterized entirely by
  the caller-supplied field weights on each `SearchDocument`. Knows nothing about projects, skills,
  or any other domain shape.

No individual query service beyond `getProfile`, `getExperience` and `searchProjects` ships from
this package yet — `getSkillEvidence` is #56.

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
