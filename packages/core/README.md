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

- **The domain services.** `getProfile()`, `getExperience(filter?)` (#54), `searchProjects(query,
  options?)` (#55), and now `getSkillEvidence(skill)` (#56) — the four query services built on the
  spine above and the complete public API of this package. See "Domain services" below for their
  signatures and documented semantics.
- **The career-data chunker.** `chunkCareerData(dataset, options?)` (#21, epic #6) turns a
  `CareerDataset` into an ordered list of retrieval `Chunk`s — stable id, content hash, citation,
  and filtering metadata each — for the RAG ingestion pipeline (#24) to embed and upsert. See "The
  career-data chunker" below.
- **`searchCareer` — semantic retrieval.** `createSearchCareer({ sql, embedder })` (#34, epic #6)
  builds the single semantic-retrieval entry point for the whole project: embed a query with the
  ingestion-time model, ANN-search the pgvector store, return ranked, plain-JSON chunks with scores
  and citations. See "`searchCareer` — semantic retrieval" below.

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

### `getSkillEvidence(repository: CareerDataRepository, skill: string): DomainResult<SkillEvidenceOutcome>`

The service that makes the project honest — it closes epic #2. Resolves `skill` — a canonical
name, or any alias/case/punctuation/diacritic variant of one, via the same `./search/`
alias-resolution module `searchProjects` uses (no fuzzy or semantic matching) — against **both**
the dataset's claimed `Skill`s and its explicit `Gap`s, and returns a `DomainResult` wrapping
`SkillEvidenceOutcome`, a discriminated union on a `kind` field with **exactly three** members:

```ts
type SkillEvidenceOutcome =
  | { kind: "claimed"; skill: Skill; evidence: Citation[] }
  | { kind: "not-claimed"; gap: Gap; relatedSkills: RelatedSkillEvidence[] }
  | { kind: "unknown"; term: string };

interface RelatedSkillEvidence {
  skill: Skill;
  evidence: Citation[];
}
```

- **`claimed`** — `skill` resolves to a claimed `Skill` record (id, name, aliases, category,
  proficiency, and its authored `evidence`). `evidence` is that skill's evidence citations,
  resolved fresh against the repository's current dataset via `buildCitation` (so a stale label on
  the content record can never leak through, and a dangling citation throws
  `UnknownEntityError` rather than being silently returned). `result.citations` **leads with a
  citation to the skill entity itself** (entityType `"skill"`, the resolved skill's own id), then
  every entry of the `evidence` array, in that order — mirroring how `not-claimed` below leads its
  own `citations` with a citation to the gap entity. This self-citation was added for #143: the
  interview agent legitimately cites the skill entity a lookup resolved (e.g.
  `[cite:skill:nodejs]`), not only the experience entries backing it, and the citations list must
  back whatever a caller is entitled to cite.

- **`not-claimed`** — `skill` resolves to a `Gap` instead of a `Skill`. This is the locked
  behavior the whole gap-discipline data model (#47, #50, #51) exists for: a term Marcos has
  deliberately not claimed **never** returns `claimed`, and never returns an empty/silently-missing
  result that a downstream model could paper over. `gap.statement` is the authored content's own
  string, passed straight through — **byte-identical**, never synthesized, reworded, or
  summarized. `relatedSkills` resolves the gap's `relatedSkills` ids to their real `Skill` records,
  each paired with its own resolved evidence citations, so a caller can render "here's the closest
  thing he has done" without a second lookup. `result.citations` is a citation to the gap entity
  itself, followed by every resolved related skill's evidence citations, in order.

- **`unknown`** — `skill` resolves to neither a claimed `Skill` nor a recorded `Gap`. `term` is the
  original input string, unmodified. This is a distinct, documented "no information" outcome —
  never conflated with `not-claimed` (which means "explicitly recorded as not done") or with an
  empty `claimed` result. `result.citations` is `[]`.

Skills are checked before gaps; the content lint rule `no-claim-gap-collision` (#51) guarantees a
Skill and a Gap never share a resolvable name/alias, so this ordering never changes the outcome for
valid content — skills simply take priority as the more specific claim. `getSkillEvidence` never
throws for an unrecognized term; it only propagates `UnknownEntityError` in the (lint-prevented,
so real-content-unreachable) case of a citation that fails to resolve against the dataset.

**Determinism:** alias resolution and evidence-citation building are both pure lookups against the
repository's dataset — no randomness, no wall-clock dependency. The same `skill` string against the
same dataset, called any number of times, returns byte-identical output.

### The list services (#211–#215)

Five deterministic enumeration services from the #188 tool-coverage audit — the read-only
counterparts to the search/lookup services above. All follow the same contract: pure reads
against the repository's dataset, a documented stable sort order (deterministic regardless of
input array order), `citations[i]` resolving to `data[i]`, and an honest empty list — never a
thrown error — when nothing matches or nothing is authored.

- **`listEducation(repository): DomainResult<EducationEntry[]>`** — every education record, most
  recent first (a missing `endDate` means in-progress and sorts first; ties by `startDate`
  descending, then `id` ascending). Optional dates are preserved exactly as authored. Citation
  label: `"{credential}, {institution}"`.
- **`listSkills(repository, filter?): DomainResult<Skill[]>`** — the full claimed-skills
  inventory, sorted by name (case-insensitive, ties by `id`). `SkillsFilter` ANDs an optional
  exact case-insensitive `category` and an optional `proficiency` enum value. Each record's
  `evidence` citations are resolved fresh against the dataset (same guarantee as
  `getSkillEvidence`'s `claimed` branch); top-level `citations[i]` is a self-citation to the
  skill entity.
- **`listGaps(repository): DomainResult<GapListEntry[]>`** — the authoritative known-gaps
  enumeration, `id` ascending. Each `GapListEntry` carries the authored `statement`
  byte-identical, with `relatedSkills` resolved from bare skill ids into skill citations
  (unresolvable ids skipped, same tolerance as `getSkillEvidence`).
- **`listProjects(repository, options?): DomainResult<Project[]>`** — every project record
  (including the full MDX `body`), `id` ascending, no scores or ranking — this complements, not
  replaces, `searchProjects`. `options.tags` pre-filters with OR semantics, each tag resolved
  through the same skill-alias index `searchProjects` uses.
- **`listWriting(repository): DomainResult<WritingEntry[]>`** — every writing entry,
  `publishedDate` descending (ties by `id`). With the currently-empty writing corpus the honest
  result is `{ data: [], citations: [] }` — "nothing published yet" is data.

## The career-data chunker (`chunkCareerData`)

`chunkCareerData(dataset: CareerDataset, options?: ChunkingOptions): Chunk[]` (#21, epic #6) turns
every entity in a `CareerDataset` into an ordered list of retrieval `Chunk`s — the input the RAG
ingestion pipeline (#24) embeds and upserts into the pgvector store defined by #14. Like the domain
services above, it is a **pure function**: no I/O, no network, no `process.env` access — its tests
need no database or API key. Unlike them, it does not take a `CareerDataRepository`; it takes an
already-loaded `CareerDataset` directly, since chunking has no need for the repository's lazy-load
memoization. Per-entity helpers (`chunkProfile`, `chunkExperience`, `chunkProject`, `chunkSkill`,
`chunkGap`, `chunkEducation`, `chunkWriting`) are also exported for chunking a single entity.

**`Chunk` shape**, chosen to map cleanly onto #14's pgvector table (camelCase here, snake_case
there — see `src/chunking/types.ts`'s doc comment for the full column mapping):

| Field         | Meaning                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `id`          | Deterministic `sha256(sourceType:sourceId:chunkIndex)` — see below.       |
| `sourceType`  | The entity-type schema `sourceId` belongs to (`profile`, `experience`, …). |
| `sourceId`    | The source entity's own stable `id`.                                     |
| `chunkIndex`  | 0-based index among chunks produced from the same source entity.         |
| `text`        | The chunk's normalized, ready-to-embed text.                             |
| `contentHash` | `sha256` of `text` (already normalized).                                 |
| `tokenCount`  | Estimated token count of `text` (see the token estimator below).         |
| `citation`    | `{ entityType, entityId, label, fragment?, url? }` — resolves the chunk back to its source record. |
| `metadata`    | Filtering metadata: `{ company?, tags?, dateFrom?, dateTo? }`, entity-type-dependent. |

`embedding` and any timestamps are deliberately **not** part of `Chunk` — those are added by the
ingestion pipeline (#24) when a chunk is actually embedded and upserted; chunking itself never
talks to an embedding model or a database.

**Strategy.** Every entity renders to a short, self-contained `header` (title/company/dates/tags)
plus an optional long-form `body` (project/writing prose). The two are joined, whitespace-normalized
(see below), and fed through one shared, token-budgeted splitter regardless of entity type:

- **Short structured records** (experience, skill, gap, education, profile) almost always produce
  exactly one chunk, because their rendered text comfortably fits under the token budget — but this
  is never hard-coded to one chunk; an unusually long highlights/evidence list would still split
  rather than silently exceed the budget.
- **Long-prose records** (project, writing) split on paragraph, sentence, and Markdown bullet-line
  boundaries — never mid-word — into as many chunks as the body needs, each overlapping the next by
  a configurable amount so a claim spanning a chunk boundary still reads in full in at least one
  chunk.

**Token estimator and defaults.** Token budgets are expressed in *estimated* tokens using a simple,
dependency-free heuristic — `estimateTokens(text) = Math.ceil(text.length / CHARS_PER_TOKEN)` with
`CHARS_PER_TOKEN = 4`, the commonly cited average for English prose under BPE-family tokenizers.
This is intentionally approximate, not an exact count for any specific embedding model's tokenizer
— the real token count fed to the embedding model is the ingestion pipeline's (#24) concern.
Defaults, both overridable via `ChunkingOptions`:

- `maxTokens`: **320** — no chunk exceeds this (estimated) token count.
- `overlapTokens`: **48** (~15% of `maxTokens`) — the estimated overlap between consecutive
  long-prose chunks from the same source. If including the full overlap would itself push a chunk
  over `maxTokens`, the overlap is dropped for that boundary — the max-token invariant always wins.

**Determinism and hashing.** `id` is `sha256(sourceType:sourceId:chunkIndex)` — a hash of the
triple named by #21, computed via `node:crypto`'s `createHash` (a Node builtin, not an npm
dependency — no allowlist entry needed, consistent with `repository.ts`'s existing `node:fs`
usage). `contentHash` is `sha256` of the chunk's own already-normalized `text`. Neither depends on
wall-clock time or randomness: running `chunkCareerData` twice on the same dataset produces
byte-identical output, and editing one source record changes only that record's chunk(s) — every
other entity's chunks are computed independently.

**Normalization.** Before splitting or hashing, text is normalized — CRLF/CR unified to LF, trailing
line whitespace stripped, runs of horizontal whitespace collapsed, runs of 3+ blank lines collapsed
to one — so a whitespace-only edit to a source record (trailing spaces, an extra blank line, tabs
vs. spaces) never changes a chunk's stored text or its `contentHash`. This is what lets the
ingestion pipeline (#24) safely skip chunks whose `contentHash` is unchanged.

**Citations.** A chunk's `citation` uses the same `{ entityType, entityId, fragment?, label }` shape
as `@hire-me-mcp/career-data`'s `Citation` (see `./citation-builder.ts`), so `entityType`/`entityId`
line up 1:1 with the interview agent's `[cite:<entityType>:<entityId>#<fragment>]` marker format
(`packages/agent/src/citations.ts`). `fragment` is populated only when an entity produced more than
one chunk (`chunk-<chunkIndex>`); a single-chunk entity's citation addresses the whole record. `url`
is populated from the source record's own canonical link when it has one (a `Project`'s first link,
a `WritingEntry`'s `url`).

See `src/chunking/` for the implementation: `text.ts` (normalization, the token estimator, the
splitter), `hash.ts` (id/content-hash derivation), `render.ts` (per-entity-type text rendering),
`types.ts` (the `Chunk`/`ChunkCitation`/`ChunkMetadata`/`ChunkingOptions` types), and `index.ts`
(`chunkCareerData` and the per-entity helpers). `src/chunking/index.test.ts` covers determinism,
isolation, per-entity-type coverage, the max-token-budget/overlap invariants, citation
cross-checking against the input dataset, whitespace-only-edit hash stability, and a committed
snapshot fixture.

## The response envelope in detail

Every domain service above returns the same `DomainResult<T>` shape:

```ts
interface DomainResult<T> {
  data: T;
  citations: Citation[];
}

interface Citation {
  entityType: "profile" | "experience" | "project" | "skill" | "gap" | "education" | "writing";
  entityId: string;
  label: string;
  fragment?: string;
}
```

`data` is the service's own result shape (a single record, an array, or — for `getSkillEvidence` —
the `SkillEvidenceOutcome` union above). `citations` is the flat list of machine-readable pointers
backing `data`, always present (even as `[]`) so a caller can render sources without parsing prose,
and never a citation to an entity that doesn't exist in the dataset — `buildCitation` throws
`UnknownEntityError`, naming the type and id, rather than building one that points at nothing.

No individual query service beyond `getProfile`, `getExperience`, `searchProjects`, and
`getSkillEvidence` ships from this package — these four are the complete public API for now; a
future service (or the epic #6 semantic-retrieval variant of `getSkillEvidence`) is additive, not
a replacement.

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

**#14** (epic #6) extended `allowed-dependencies.json` once, with `postgres` (the Neon pgvector
store's driver) and `tsx` (to run the migration CLI) — see "Database (Neon pgvector store)" below.
**#24** extended it again with `@ai-sdk/google` and `ai` (the embedding client, see "Embedding
client and shared config" below) — `searchCareer` (#34) is expected to reuse the same two rather
than adding a third. **#41** extended it once more with `zod` (already a dependency of
`@hire-me-mcp/career-data`/`@hire-me-mcp/agent` elsewhere in the monorepo, same version) — the
golden retrieval dataset's schema (`src/eval-retrieval/dataset/schema.ts`) validates entries the
same way `packages/career-data`'s own content schemas do. That is the intended way to evolve this
boundary: the
allowlist exists to make the decision visible and reviewable in a diff, not to freeze
`packages/core` forever. If you're adding a dependency here: edit `allowed-dependencies.json` in
the same PR, and explain why in the PR description — don't work around the check.

What should never be added, regardless of the allowlist: `react`, `next`, or any HTTP-framework
package. Biome's `noRestrictedImports` override exists specifically because the dependency
allowlist alone wouldn't stop someone from importing a *transitive* framework dependency that
another allowed package happens to pull in.

## Database (Neon pgvector store)

`src/db/` (#14, epic #6) is the Neon Postgres + pgvector store backing the ingestion pipeline
(#24, see below) and the future `searchCareer` (#34). It's exported as its own subpath,
**`@hire-me-mcp/core/db`** — separate from the package's main entry point (mirroring `./slugify`)
— so consumers that never touch a database (e.g. `apps/web`'s client-safe code) don't pull in the
`postgres` driver just by importing `@hire-me-mcp/core`.

### Driver choice

[`postgres`](https://github.com/porsager/postgres) (porsager/postgres), not `pg` or
`@neondatabase/serverless`: a single dependency-free package with built-in TypeScript types,
tagged-template queries (parameterized by default), a built-in connection pool, and graceful
shutdown (`sql.end()`) — all over the same plain TCP connection string Neon's pooled `DATABASE_URL`
already is. `@neondatabase/serverless` pulls in a WebSocket transport (`ws`) this project doesn't
need, since nothing here runs on an edge runtime without TCP sockets.

### ADR: embedding dimension and distance metric

Recorded in full as a comment in `src/db/migrations.ts` (the migration itself), summarized here:

- **Dimension: 768.** The chat/agent LLM default is Google's free tier (see root `.env.example`);
  embeddings come from `gemini-embedding-001`, which supports Matryoshka Representation Learning
  (MRL) truncation. 768 is the chosen truncation — comfortably inside the free tier, a supported
  MRL size, and a common pgvector/HNSW dimension.
- **Distance metric: cosine.** The `career_chunks.embedding` column's HNSW index uses
  `vector_cosine_ops`; any query against it must use the `<=>` (cosine distance) operator for the
  query planner to actually use the index. Similarity is `1 - cosine_distance`.
- **Index: HNSW**, not IVFFlat — no list-count tuning required, good recall out of the box, fine
  at this project's small corpus size.

### Migrations

Plain SQL, authored as an array of statements per migration (`src/db/migrations.ts`) rather than
one multi-statement blob, so the runner (`src/db/migrate.ts`) can execute each one individually via
`sql.unsafe()` without depending on the driver's simple-query protocol mode. Applied migrations are
tracked in a `schema_migrations` table; running the same migration set twice is a no-op.

```bash
# Requires DATABASE_URL — see .env.example.
pnpm --filter @hire-me-mcp/core db:migrate
```

### Repository

`upsertChunk`/`getChunkById`/`findSimilarChunks` (`src/db/chunks-repository.ts`) are the only way
callers read/write `career_chunks`. `upsertChunk` is an `ON CONFLICT (id) DO UPDATE` — inserting a
chunk with an existing stable `id` updates it in place rather than duplicating a row, which is what
lets the future ingestion pipeline re-index changed content idempotently. `findSimilarChunks` runs
the ANN query using the `<=>` cosine-distance operator matching the HNSW index above.

### Running the DB integration suite locally

`src/db/rag-store.integration.test.ts` creates a throwaway Neon branch via the Neon API, runs
migrations against it, exercises upsert idempotency and ANN ordering with seeded fixture vectors,
and deletes the branch on teardown (including on failure — the `afterAll` runs regardless of which
`it` failed). It's part of the normal `src/**/*.test.ts` suite `pnpm test` picks up, but **skips
with a console message** — never silently, never a hard failure — when `NEON_API_KEY` and
`NEON_PROJECT_ID` aren't both set:

```bash
# Set these in an untracked .env.local (or export them directly) — never commit real values.
NEON_API_KEY=... NEON_PROJECT_ID=... pnpm --filter @hire-me-mcp/core test
```

A personal Neon API key with access to the project is required (`console.neon.tech` -> Account
Settings -> API Keys). The suite only ever creates/deletes its own throwaway branch — it never
touches the project's real (`production`) branch or `DATABASE_URL`.

## Usage analytics (`@hire-me-mcp/core/analytics`, #79)

An anonymized usage-analytics pipeline records two event families to the same Neon database
(migration `003_add_analytics_events`, `src/db/migrations.ts`): a **tool event** per MCP tool call
or per tool the chat agent invokes (`surface: "mcp" | "chat"`, `toolName`, `outcome`,
`latencyBucket`), and a **question event** per chat turn (a taxonomy theme label, `latencyBucket`,
`usedRetrieval`). See `docs/analytics.md` at the repo root for the full schema, the outcome/theme
taxonomies, the scrubbing guarantee, and the documented retention window — this section only
covers the module layout.

- `src/analytics/taxonomy.ts` — the closed vocabularies (`SURFACES`, `TOOL_OUTCOMES`,
  `QUESTION_THEMES`, `LATENCY_BUCKETS`) every field must be a member of.
- `src/analytics/scrubber.ts` — the last line of defense before a write: rejects (throws
  `AnalyticsScrubError`) any event carrying a value outside its taxonomy, or a `toolName` that
  isn't a short label-shaped string (so a raw question or a raw contact message structurally
  cannot pass as a valid field value).
- `src/analytics/theme-classifier.ts` — `classifyQuestionTheme(question)`: a deterministic
  keyword/rules classifier, no LLM call, no I/O. Raw question text is this function's *input*
  only — never its output, never persisted.
- `src/analytics/analytics-repository.ts` — the only module that writes to or deletes from
  `analytics_tool_events`/`analytics_question_events`, mirroring `chunks-repository.ts`'s
  "repository is the seam" convention. Every insert scrubs first.
- `src/analytics/store.ts` — `recordToolEvent`/`recordQuestionEvent`: fire-and-forget wrappers a
  request path calls without `await`ing; a rejected or throwing store is caught and logged, never
  propagated, so a broken analytics write can never fail or measurably delay a tool call or chat
  answer.
- `src/analytics/retention.ts` — `RETENTION_WINDOW_DAYS` (90) is the single exported constant the
  retention cron route (`apps/web/app/api/cron/analytics-retention/`), this README, and
  `docs/analytics.md` all read from, so they cannot drift out of sync.

No per-session/per-caller grouping key is stored at all — the locked decision was to omit
session/caller grouping entirely (simpler than a rotating salted hash, the alternative the issue
allowed) rather than add one nothing here actually needs: theme distribution, tool outcome counts,
and latency all aggregate fine without ever being able to link two events back to the same visitor.

## Embedding client and shared config (`@hire-me-mcp/core/embedding`)

`src/embedding/` (#24, epic #6) is the single source of the embedding model identifier, provider,
and dimension — `EMBEDDING_MODEL_ID` (`gemini-embedding-001`), `EMBEDDING_PROVIDER` (`"google"`),
`EMBEDDING_DIMENSION` (768, matching the `vector(768)` column ADR above). Both the ingestion
pipeline below and the future `searchCareer` (#34) import these constants rather than repeating
the literal, so a query embedded at search time is guaranteed to use the same model/dimension as
what's stored. Exported as its own subpath, **`@hire-me-mcp/core/embedding`** — separate from the
main entry point, mirroring `./db` — so consumers that never embed anything don't pull in
`@ai-sdk/google`/`ai` just by importing `@hire-me-mcp/core`.

`createEmbeddingClient` (`src/embedding/client.ts`) wraps a low-level `embedBatch` function with:

- **Batching** — fixed-size groups (`batchSize`, default 16), sequential (not concurrent) to keep
  the free-tier request rate low.
- **Retry with exponential backoff** on retryable failures (HTTP 429 rate-limit, 5xx transient
  errors) — `maxRetries` attempts (default 4), doubling the delay each time (`initialDelayMs`,
  default 500ms).
- **Deterministic ordering** — `embed(texts)[i]` is always the embedding for `texts[i]`, regardless
  of batch boundaries, since batches are processed in order and their results concatenated.
- **Abort on permanent failure** — a non-retryable error, or retries exhausted, throws
  `EmbeddingFailureError` rather than silently returning partial/wrong-length results (also thrown
  if a provider ever returns a different vector count than the batch it was given).

This is fully unit tested (`client.test.ts`) with a faked `embedBatch` and an injectable `sleep` —
no network, no real timers. `createGoogleEmbeddingClient` (`google-client.ts`) is the only module
that imports `@ai-sdk/google`/`ai`; it supplies the real `embedBatch` via `embedMany`, passing
`providerOptions.google.outputDimensionality: EMBEDDING_DIMENSION` so Google's MRL truncation
produces exactly 768-dimensional vectors.

## Ingestion pipeline (`pnpm ingest`, #24)

`src/ingest/` orchestrates: load the career dataset (`CareerDataRepository`) -> chunk it
(`chunkCareerData`, #21) -> diff against the store's fingerprints -> embed only what's needed ->
write. See `docs/development.md` "Ingestion pipeline (`pnpm ingest`)" for how to run it; this
section covers the module layout.

- **`diff.ts` — `computeIngestDiff`.** Pure, no I/O: compares fresh `Chunk[]` against
  `ChunkFingerprint[]` (`{ id, contentHash, embeddingModel }`, from
  `listChunkFingerprints` — a cheap scan that never fetches `embedding`/`content`) and classifies
  each into `toInsert` / `toUpdate` / `unchanged`, plus stale store ids into `toDelete`. A chunk is
  `unchanged` only when both its `contentHash` **and** the row's `embeddingModel` match the
  currently configured `EMBEDDING_MODEL_ID` — a model-id mismatch (including migration 002's `''`
  default on any row that predates this column) is treated as needing re-embedding, which is the
  mechanism a configured model change uses to trigger a full re-embed without a separate code
  path. `--full` (`options.full`) skips the match check entirely. Unit tested with hand-built
  `Chunk`/`ChunkFingerprint` fixtures — no network, no database.
- **`run.ts` — `runIngest`.** Orchestrates repository -> chunker -> diff -> embed -> write, taking
  the `CareerDataRepository`, chunker function, an `IngestEmbedder` (`{ embed(texts) }`), and an
  `IngestStore` all as injected options — which is what makes it unit testable
  (`run.test.ts`) against fakes for all four, asserting (via `vi.spyOn`) that an unchanged re-run
  makes zero `embed()`/`upsertMany()`/`deleteMany()` calls. **Ordering matters**: `embedder.embed()`
  is awaited — and can throw — before any `store` write happens, so a permanent embedding failure
  propagates out having made zero writes, with no rollback needed. `--dry-run` returns the diff
  counts without ever calling the embedder or the store.
- **`store.ts` — `IngestStore` / `createDbIngestStore`.** The storage seam: `listFingerprints`,
  `upsertMany`, `deleteMany`. `createDbIngestStore` is the real adapter over
  `chunks-repository.ts`, running each of `upsertMany`/`deleteMany` inside its own `sql.begin`
  transaction.
- **`args.ts` / `summary.ts`.** Pure CLI flag parsing (`parseIngestArgs` — `--dry-run`, `--full`,
  tolerant of a leading `--` passthrough separator since `pnpm ingest -- --dry-run` forwards one)
  and a one-line summary formatter (`formatIngestSummary`) for CI-log-friendly output.
- **`cli.ts`.** The `pnpm --filter @hire-me-mcp/core ingest` entry point (root `pnpm ingest`
  forwards to it) — reads `DATABASE_URL`/`GOOGLE_GENERATIVE_AI_API_KEY`, wires the real
  `createContentCareerDataRepository`/`chunkCareerData`/`createGoogleEmbeddingClient`/
  `createDbIngestStore` together, prints the summary, and exits non-zero (naming the missing
  variable, never its value) on any misconfiguration or failure. Tested as a subprocess
  (`cli.test.ts`, mirroring `db/migrate-cli.test.ts`) for the network-free misconfigured-env and
  bad-flag paths only — importing it directly would run its real top-level side effects at test
  collection time.

`src/ingest/run.integration.test.ts` is the real-Neon counterpart to the unit tests above: it runs
the full insert -> zero-call re-run -> edit -> delete -> `--dry-run` -> `--full` -> model-change ->
permanent-failure cycle against a throwaway Neon branch, using a faked (deterministic, spy-asserted,
no real network) embedder — see "Running the DB integration suite locally" above for the
`NEON_API_KEY`/`NEON_PROJECT_ID` gating, which this suite shares.

## `searchCareer` — semantic retrieval (`@hire-me-mcp/core/search-career`, #34)

`createSearchCareer({ sql, embedder, modelId? })` builds a `searchCareer(query, options?) =>
Promise<SearchCareerResult>` function — the single semantic-retrieval entry point for the whole
project. It embeds `query` with the same model used at ingestion, runs an ANN cosine-similarity
query against the `career_chunks` pgvector store (#14), and returns ranked chunks with scores and
citations as **plain, JSON-serializable data** — no class instances, no DB row leakage — so the
future MCP tool (`search_career`, epic #3) and the chat agent (epic #5) can pass a `searchCareer`
result straight through their own response shapes. Exported as its own subpath,
**`@hire-me-mcp/core/search-career`** — mirroring `./db` and `./embedding` — since it necessarily
pulls in the `postgres` driver for a live query, not just types.

`searchCareer` never answers questions or synthesizes prose — it returns evidence for a caller (the
agent layer) to reason about. Deterministic career-data lookups (`getExperience`, `searchProjects`,
`getSkillEvidence`) stay the primary path for exact questions; `searchCareer` covers fuzzy,
cross-cutting questions those can't answer.

```ts
import { createDbClient, loadDbConfig } from "@hire-me-mcp/core/db";
import { createGoogleEmbeddingClient, loadEmbeddingApiKey } from "@hire-me-mcp/core/embedding";
import { createSearchCareer } from "@hire-me-mcp/core/search-career";

const { sql } = createDbClient(loadDbConfig());
const embedder = createGoogleEmbeddingClient({ apiKey: loadEmbeddingApiKey() });
const searchCareer = createSearchCareer({ sql, embedder });

const result = await searchCareer("event-driven architecture experience", { topK: 5 });
// { query, results: [{ text, score, citation, sourceType, sourceId, chunkIndex }, ...], tookMs }
```

### Score semantics

`score` is **cosine similarity**, `1 - cosine_distance`, computed with pgvector's `<=>` operator
against the `career_chunks.embedding` column's `vector_cosine_ops` HNSW index — the same metric and
operator `findSimilarChunks` uses (see the ADR in "Database (Neon pgvector store)" above). For
unit-magnitude vectors this is mathematically bounded to `[-1, 1]`, `1` meaning identical direction,
`0` orthogonal (no discernible relationship), negative meaning opposed; the embedding provider
(`gemini-embedding-001`) returns effectively unit-normalized vectors, so in practice scores cluster
in a narrower positive band. Higher is always more similar, and `results` is always sorted by
`score` descending.

### Options and defaults

`SearchCareerOptions`:

- **`topK?: number`** — max results to return. Defaults to **10**. Must be an integer in `[1, 50]`
  (`MIN_TOP_K`/`MAX_TOP_K`) — anything else throws `InvalidTopKError` before any embedding call.
- **`minScore?: number`** — minimum cosine-similarity score a result must meet. Defaults to **0**
  (no filtering) — cosine similarity of `0` means "no discernible relationship", so the default
  leaves everything the ANN index returns in place and lets a caller raise the bar explicitly.
- **`sourceTypes?: readonly string[]`** — restricts results to the given `sourceType`s (e.g.
  `["project", "experience"]`), pushed into the SQL `WHERE` clause (not filtered after the fact) so
  `topK` is still applied to the filtered set. Omitted/empty imposes no constraint.

### Validation, empty store, and the embedding-model guard

- An empty/whitespace-only query, or one longer than `MAX_QUERY_LENGTH` (2000 characters), throws
  `InvalidSearchCareerQueryError`. An out-of-range/non-integer `topK` throws `InvalidTopKError`.
  Both are checked **before** the embedder is ever called — no wasted embedding API call for
  invalid input.
- Querying an empty store returns `{ query, results: [], tookMs }` — never throws.
- Every result's stored `embedding_model` is checked against the configured model id (`modelId`
  option, defaulting to `EMBEDDING_MODEL_ID`). Comparing vectors from two different embedding
  models produces meaningless similarity scores, so a mismatch throws
  `StoredEmbeddingModelMismatchError` — naming both the configured model and the offending
  stored one(s) — rather than silently returning garbage-ranked results. This is the reason a model
  change requires re-running ingestion (see "a configured model-id change triggers a full re-embed"
  above) before searching again.

### Query-embedding cache

`createSearchCareer` closes over a small `Map<trimmedQuery, embedding>` cache scoped to that one
call's lifetime (i.e. one process/one run) — an identical repeated query (after `.trim()`) reuses
the cached vector instead of re-embedding, which matters for eval harnesses and chat sessions that
legitimately re-ask the same question. A different query string always re-embeds.

### Testing

`search-career.test.ts` unit-tests validation, defaults, caching, filtering (`topK`/`minScore`/
`sourceTypes`), the model-mismatch guard, and the plain-JSON round-trip, against a fake
`postgres`-shaped `sql` tag function (no database, no network) — the same fake-`sql` convention
`db/migrate.test.ts` established. `search-career.integration.test.ts` is the real-Neon counterpart:
it seeds a throwaway branch with several hundred synthetic fixture rows (large enough that the
query planner has a real reason to prefer the HNSW index) plus targeted fixtures, using a fake,
deterministic embedder (never a real embedding API call — see "Running the DB integration suite
locally" above), and asserts real ANN score-descending ordering with citations, a fuzzy
cross-cutting query ranking a conceptually related chunk above an unrelated decoy, the
model-mismatch error against a real stale row, and — via `EXPLAIN` with `SET LOCAL enable_seqscan =
off` — that the query plan actually uses `career_chunks_embedding_hnsw_idx` rather than a
sequential scan.

## Retrieval evals (`pnpm eval:retrieval`, #41)

`src/eval-retrieval/` scores `searchCareer` (#34) against a committed, typed golden dataset of
query -> expected-source-id pairs (`src/eval-retrieval/dataset/cases.ts`) — recall@k, precision@k,
and mean reciprocal rank become a measured, regression-guarded property of retrieval quality
rather than a vibe. It mirrors `packages/agent/src/evals/`'s pure-runner/injected-real-call shape:
`metrics.ts` (pure), `dataset/schema.ts` + `dataset/cases.ts` (the dataset), `runner.ts` (executes
the dataset against an injected `searchCareer`-shaped function), `report.ts` (assembles the
machine-readable report and verdict), `thresholds.ts` (the committed pass/fail bars), and `cli.ts`
(wires it all to the real database + embedding client).

```bash
pnpm eval:retrieval   # runs the golden dataset against a populated store, writes retrieval-eval-report.json
```

Requires `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY` (see `.env.example`), and a store
already populated by `pnpm ingest` (#24) — this command only queries, it never ingests. Locally,
the checked-in `.env`'s `GOOGLE_GENERATIVE_AI_API_KEY` is a known-invalid placeholder, so a real
run happens via `.github/workflows/retrieval-eval.yml` — a **required PR check** as of #52 — against
a disposable Neon branch (created, migrated, ingested, evaluated, and deleted in one job run,
path-filtered to PRs that touch `packages/core/**`/career-data content, plus `workflow_dispatch`
for an on-demand run) — see that workflow file for the exact steps, and `docs/development.md`'s
"How re-indexing works" section for the full PR/production/local loop picture.

### The dataset: categories and target size

Every entry (`src/eval-retrieval/dataset/schema.ts`) has an `id`, a recruiter/hiring-manager
phrased `query`, a `category`, and `expectedSources` — an array of `{ sourceType, sourceId }`
pointers into the SAME source-id space `chunkCareerData` (#21) and `searchCareer`'s own
`sourceType`/`sourceId` result fields use, never a chunk id (chunk ids churn whenever chunking is
retuned; source ids don't). Four categories, weighted toward the two semantic search has to "earn":

- **`exact`** — a deterministic single-fact question (an exact skill, an exact role/company). A
  sanity floor; semantic search should find these trivially.
- **`fuzzy`** — recruiter phrasing with no literal wording overlap with the source content (e.g.
  "Does he have experience with event-driven architecture?" against content that never uses that
  exact phrase together).
- **`cross-cutting`** — a thematic question whose answer legitimately spans several source records
  (multiple skills, multiple experience entries, multiple projects).
- **`absent-topic`** — a plausible recruiter question about something genuinely absent from the
  corpus (e.g. blockchain, SAP, penetration testing). Requires `expectEmpty: true` and an empty
  `expectedSources` array (enforced by the schema); the runner passes these only when nothing comes
  back at or above `absentTopicMinScore` (default `0.4`, `EVAL_RETRIEVAL_ABSENT_MIN_SCORE` env
  override) — matching `searchCareer`'s own inclusive (`>=`) `minScore` semantics.

25 entries as of #41 (6 exact / 10 fuzzy / 4 cross-cutting / 5 absent-topic) — the target is "many
enough that one flaky/borderline query can't single-handedly swing the aggregate metrics by more
than a few percentage points," not an exact count. `src/eval-retrieval/dataset/validate-sources.ts`
+ its test resolve every `expectedSources` pointer against the REAL, current
`@hire-me-mcp/career-data` content (no fixtures) — a typo'd or renamed source id in the dataset
fails that test immediately, offline, rather than silently under-scoring a real eval run.

### Adding a golden query

1. Pick a `category` (see above) and write the query the way a recruiter/hiring manager would
   actually ask it — public-portfolio phrasing only, no private data (this is a public repo).
2. Find the real source id(s) the answer should resolve to in `packages/career-data/content/*`
   (the entity's own `id` field — for `profile`, that's `profile.json`'s `id`; for everything else,
   the filename doubles as the id). Use the exact `sourceType` the entity's own citation would use:
   `profile`, `experience`, `project`, `skill`, `gap`, `education`, or `writing`.
3. Add the entry to `src/eval-retrieval/dataset/cases.ts` with a `notes` field citing the exact
   content file(s) it's grounded in (or absent from, for `absent-topic`).
4. Run `pnpm --filter @hire-me-mcp/core test src/eval-retrieval` — `cases.test.ts` and
   `validate-sources.test.ts` catch a malformed entry or a dangling source id immediately, with no
   database needed.

### Interpreting a failure

`pnpm eval:retrieval`'s console output prints one `[PASS]`/`[FAIL]` line per query (with its
recall/precision/MRR, or its `expectEmpty` result for `absent-topic`), followed by the aggregate
metrics and, on failure, which aggregate(s) missed their threshold. The full detail — every
retrieved source and score per query — is in the written JSON report
(`retrieval-eval-report.json` by default, `EVAL_RETRIEVAL_REPORT_PATH` override). A single failing
query usually means one of: the expected source's content genuinely doesn't support the query as
phrased (fix the dataset entry), a real regression in `searchCareer`/ingestion/chunking (fix the
code), or the query is more ambiguous than intended (rephrase it). An aggregate-threshold failure
with most individual queries passing usually means a handful of genuinely harder `cross-cutting`
queries are dragging the mean down — check the per-query table for which ones.

### Threshold-change policy

Thresholds are committed in `src/eval-retrieval/thresholds.ts`, each with a one-line rationale in
that file's own doc comment. **Raising** a threshold may be done casually, in the same PR as the
change that earned the improvement. **Lowering** a threshold requires a written justification in
the PR description — what real run produced the number that no longer clears the old bar, and why
that's an honest new floor rather than moving the goalposts to hide a regression.

## Testing conventions specific to this package

- Every test that exercises `createContentCareerDataRepository()` against real content passes an
  explicit `contentDir` pointing at a fixture directory (see `packages/career-data`'s
  `__fixtures__/`) — never the real, evolving `packages/career-data/content/`.
- Tests for anything built on top of `CareerDataRepository` should use
  `createInMemoryCareerDataRepository()` with a hand-built fixture dataset (`emptyCareerDataset()`
  spread + overrides), not the content-backed implementation — that's the whole point of the seam.
