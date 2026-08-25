# Development reference

Deep-dive operational reference for contributors and agents working on this codebase — linting,
the full test pyramid, pre-commit hooks, and CI/branch protection. The root
[`README.md`](../README.md#local-development) covers the short list of commands to actually get
started; this document is where the "why" and the exact mechanics live. See also
[`AGENTS.md`](../AGENTS.md) for the contributor rules (test-first development, the three layers of
enforcement) this document assumes.

## Linting and formatting (Biome)

[Biome](https://biomejs.dev) is the **single** linter and formatter for the whole repo — there is
no ESLint or Prettier anywhere, and none should be added. A single root `biome.json` configures
formatting and linting for every workspace package; packages inherit it rather than duplicating
rules.

```bash
pnpm lint                  # turbo run lint — biome check in every package (fans out, cacheable)
pnpm --filter web lint     # lint a single package
pnpm format                # biome format --write . — format the whole repo
pnpm format:check          # biome format . — check formatting without writing
bash scripts/biome-check.sh check .   # run Biome directly across the whole repo (format + lint + import sort)
```

Strict rules are enforced at `error` severity, not `warn`: no explicit or implicit `any`
(`noExplicitAny`, `noImplicitAnyLet`), cognitive complexity limits
(`noExcessiveCognitiveComplexity`), no unused imports/variables, and organized imports enforced as
part of `biome check`. Named exports are preferred over default exports (`noDefaultExport`); the
only exception is Next.js App Router files that the framework requires to use a default export
(`page.tsx`, `layout.tsx`, `route.ts`, etc. under `apps/web/app/**`, plus `next.config.ts`), which
are excluded via a `biome.json` override.

Every Biome invocation in this repo — `pnpm lint`/`pnpm format` in each package, the lefthook
pre-commit hook, and any raw invocation — goes through `scripts/biome-check.sh`, a bounded retry
wrapper (max 3 attempts) around `pnpm exec biome`. Biome 2.5.9 intermittently crashes its linter
worker process with exit 254 ("Linter process terminated abnormally (possibly out of memory)"),
reproducing on macOS (Apple Silicon) but never observed on CI's Linux runners
([#96](https://github.com/garusis/hire-me-mcp/issues/96)). The wrapper retries only on exit 254 —
a real lint/format failure (`exit 1`) still fails on the first attempt. Prefer
`bash scripts/biome-check.sh check .` (or `format`/`format --write`) over invoking
`biome`/`pnpm exec biome` directly so you get the same protection.

If you use VS Code, install the
[Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) —
`.vscode/settings.json` already sets it as the default formatter with format-on-save, so editor
and agent edits converge on the same output.

## Testing (Vitest)

[Vitest](https://vitest.dev) is the unit/integration test runner for the whole repo. A shared base
config (`vitest.config.base.ts`, root) sets the test file convention, exclusions, and coverage
settings; each package's `vitest.config.ts` extends it via `mergeConfig`, adding only what differs
— `environment: "node"` for `packages/*`, `environment: "happy-dom"` plus the
`@vitejs/plugin-react` plugin for `apps/web` (App Router components need JSX/React support;
`happy-dom` is a pure-JS DOM implementation, so no browser is ever downloaded or launched —
Playwright/e2e is a separate command, documented below). Coverage uses the `v8` provider; no hard
threshold is enforced yet, so `test:coverage` just has to run clean and print a report.

**Test file convention — co-located `*.test.ts` / `*.test.tsx` next to the source file they
exercise** (e.g. `src/index.ts` → `src/index.test.ts`, `app/page.tsx` → `app/page.test.tsx`). This
is chosen over a parallel `tests/` directory because it keeps a 1:1, greppable mapping between a
source file and its test with no path translation — `path/to/foo.ts` always has its test at
`path/to/foo.test.ts`, which is exactly the deterministic rule the TDD tooling needs to map one to
the other (see `AGENTS.md` and `tooling/tdd-guard`).

```bash
pnpm test                        # turbo run test — vitest run in every package (cacheable)
pnpm --filter web test           # test a single package
pnpm --filter web test:watch     # watch mode for a single package (not run by turbo)
pnpm test:coverage        # turbo run test:coverage — vitest run --coverage everywhere
pnpm --filter web test:coverage  # coverage for a single package
```

## Database integration tests (Neon pgvector, real branch)

`packages/core/src/db/rag-store.integration.test.ts` (#14, epic #6) and
`packages/core/src/ingest/run.integration.test.ts` (#24, epic #6) are part of the normal
`pnpm test` / `pnpm turbo test` suite — Vitest picks them up like any other `*.test.ts` — but
they're gated on Neon API credentials rather than always running against a shared database. Full
writeup, including the embedding-dimension/distance-metric ADR and driver choice, lives in
[`packages/core/README.md`](../packages/core/README.md#database-neon-pgvector-store); the short
version:

- Set `NEON_API_KEY` and `NEON_PROJECT_ID` (a personal Neon API key with access to the project) to
  run them for real — each creates its own throwaway Neon branch, runs migrations against it, and
  deletes it on teardown (including on failure).
- Either missing (the default for local dev and most CI jobs) makes the suites skip with a clear
  console message — never silently, never a hard failure for contributors without Neon
  credentials.
- CI runs both in the same job, `db-integration` (`.github/workflows/ci.yml`), separate from
  `quality` so a slow/flaky Neon branch-provisioning call never blocks the required checks. Like
  `preview-e2e`/`lighthouse`, it skips (rather than fails red) when the required secrets aren't
  available — the case for fork PRs, which never receive repo secrets.
- The ingestion integration suite embeds with a faked, deterministic, no-network embedder (spied
  on to assert the "unchanged content -> zero embedding calls" incremental path) rather than the
  real Google API — it doesn't need `GOOGLE_GENERATIVE_AI_API_KEY`, only the Neon credentials
  above. To run `pnpm ingest` for real (with real embeddings) locally, see "Ingestion pipeline
  (`pnpm ingest`)" below.

## Ingestion pipeline (`pnpm ingest`)

`pnpm ingest` (#24, epic #6) reads the typed career corpus
(`@hire-me-mcp/career-data`), chunks it (`chunkCareerData`, #21), embeds new/changed chunks with
Google's `gemini-embedding-001` (truncated to 768 dimensions — see
`packages/core/src/embedding/config.ts`, the single place both ingestion and the future
`searchCareer` (#34) read the model id/dimension from), and upserts them into the Neon + pgvector
store (#14) — incrementally: re-running it with no content changes makes **zero** embedding API
calls and zero writes.

```bash
pnpm ingest                    # incremental: only embeds/writes new or changed chunks, deletes orphans
pnpm ingest -- --dry-run       # reports the insert/update/delete/unchanged diff, no embedding calls, no writes
pnpm ingest -- --full          # re-embeds every chunk regardless of content-hash match
```

(The `--` before the flag is required — it's `pnpm`'s own arg-passthrough separator for a root
script that forwards into `pnpm --filter @hire-me-mcp/core ingest`.)

Requires both `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY` (see `.env.example`) — missing
either fails fast with a message naming the variable, never its value. On completion it prints a
one-line summary (`inserted: N, updated: N, deleted: N, unchanged: N, embedding calls: N, wall
time: Nms`) so re-index behavior is visible in CI logs once this is wired into a deploy step
(#41, out of scope for #24). A permanent embedding failure (retries exhausted, or a non-retryable
error) aborts the whole run with a non-zero exit code and makes no database writes at all — see
`packages/core/src/ingest/run.ts`'s docstring for why ordering (embed everything needed, then
write) makes that guarantee free rather than requiring a rollback.

Changing the embedding model id (`EMBEDDING_MODEL_ID` in `embedding/config.ts`) triggers a full
re-embed on the next run: each row stores the model id it was embedded with
(`career_chunks.embedding_model`, migration `002_add_embedding_model`), and any row whose stored
model id doesn't match the currently configured one is treated as stale — the same mechanism a
brand-new column default (`''`, never a real model id) uses to make every pre-#24 row look stale
on its first run.

## Retrieval evals (`pnpm eval:retrieval`)

`pnpm eval:retrieval` (#41, epic #6) scores `searchCareer` (#34) — recall@k, precision@k, mean
reciprocal rank — against a committed golden dataset of recruiter-phrased query -> expected-source
pairs (`packages/core/src/eval-retrieval/dataset/cases.ts`), printing a per-query pass/fail table
plus aggregate metrics and writing a machine-readable JSON report. Full write-up — dataset
categories, how to add a golden query, how to interpret a failure, and the threshold-change policy
— lives in [`packages/core/README.md`](../packages/core/README.md#retrieval-evals-pnpm-evalretrieval-41).
Like `pnpm ingest`, it needs `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY` and a populated
store; a real run against the local (known-invalid) API key isn't possible, so it's run for real
via `.github/workflows/retrieval-eval.yml` — a required PR check as of #52, see "How re-indexing
works" and the CI section below.

## How re-indexing works (local / PR / production loops) — #52

Three loops, all running the exact same underlying commands (`db:migrate` then `pnpm ingest`), so
"does it work" only ever needs verifying once per loop rather than once per environment:

- **Local loop.** A contributor edits `packages/career-data/content/**`, then runs `pnpm
  --filter @hire-me-mcp/core db:migrate && pnpm ingest` against their own `DATABASE_URL` (a
  personal Neon branch or database) to see the new content indexed and retrievable via
  `pnpm eval:retrieval` / `searchCareer`. Nothing here is automatic — a local run only ever
  happens when a contributor chooses to run it.
- **PR loop** (`.github/workflows/retrieval-eval.yml`, required check). The workflow runs on
  EVERY pull request (a required check must always report a status — #176); a first in-job step
  decides relevance via the shared detection mechanism (#207) — turborepo's affected-package
  graph plus an explicit asset regex, with a `run-evals` label override; see "What triggers the
  eval workflows" below. Irrelevant PRs report green in seconds with zero Neon branches
  and zero embedding calls. Relevant PRs run the full loop: create a disposable Neon branch, run
  migrations, run a full `pnpm ingest`
  (real embeddings — the branch starts empty, so this is never an incremental no-op), runs `pnpm
  eval:retrieval` against it, uploads the JSON report as a build artifact, writes the aggregate
  metrics vs. thresholds to the job summary, and deletes the branch in an `always()` step
  regardless of outcome. A PR that degrades retrieval quality below the committed thresholds
  (`packages/core/src/eval-retrieval/thresholds.ts`) fails this required check and cannot merge.
  `db-integration` (`ci.yml`, runs unconditionally on every PR) independently exercises the same
  disposable-branch pattern for the `#14`/`#24`/`#34` integration suites — together, opening a PR
  is enough to exercise branch creation, migration, real ingestion, integration tests and the
  retrieval eval, all against disposable databases, all cleaned up on completion.
- **Production loop** (`.github/workflows/reindex-production.yml`). Every push to `main` that
  touches the same paths runs migrations and a real, incremental `pnpm ingest` directly against
  production's `DATABASE_URL` — no Neon branch, no dry run. Because ingestion is incremental and
  idempotent (#24), an unchanged-content re-run makes zero embedding calls and zero writes (visible
  in the ingestion summary line the job prints); a genuinely new/changed chunk gets embedded and
  written for real, and a permanent ingest failure fails the job loudly rather than leaving a
  stale or partial index in place. This is a **separate GitHub Actions job, not part of Vercel's
  own build** — see `docs/deployment.md`'s "CI vs. Vercel" section for why the two systems are kept
  independent; a transient ingest hiccup should never block an otherwise-healthy deploy, and a
  deploy failure should never skip a needed reindex.

All three loops are provisioned by the same two building blocks: `packages/core/src/db/neon-branch.ts`
(TypeScript, used by the integration test suites) and `scripts/ci/retrieval-eval/neon-branch.mjs`
(a standalone pre-build script with the same create/delete shape, used by `retrieval-eval.yml`
before any package is built). `scripts/ci/neon-branch-cleanup.mjs`, run daily by
`.github/workflows/neon-branch-cleanup.yml`, is the stale-branch safety net for all of them: it
deletes any `hire-me-mcp-`-prefixed branch older than 24h that a run's own `always()` cleanup step
somehow missed (a hard runner crash, a cancelled mid-step run), while explicitly refusing to touch
the project's `default`/`protected` branch. Run it manually with:

```bash
NEON_API_KEY=... NEON_PROJECT_ID=... node scripts/ci/neon-branch-cleanup.mjs             # delete branches older than 24h
NEON_API_KEY=... NEON_PROJECT_ID=... node scripts/ci/neon-branch-cleanup.mjs --dry-run    # list only
NEON_API_KEY=... NEON_PROJECT_ID=... node scripts/ci/neon-branch-cleanup.mjs --max-age-hours=6
```

## End-to-end tests (Playwright)

[Playwright](https://playwright.dev) is the e2e runner, fully separate from Vitest: it owns its
own command (`pnpm test:e2e`), its own config (`playwright.config.ts`, root), and its own CI job
(`e2e` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) — `pnpm test` / `pnpm turbo
test` never downloads or launches a browser, and `pnpm test:e2e` never runs Vitest. Specs live
under `apps/web/e2e/*.spec.ts` (a `.spec.ts` suffix, not `.test.ts`, so Vitest's `include` globs
never pick them up), currently one smoke spec (`apps/web/e2e/home.smoke.spec.ts`) that asserts the
scaffolded home page responds and its `<h1>` heading is visible.

The suite targets a **production build**, not the dev server: Playwright's `webServer` option runs
`pnpm turbo run build --filter=@hire-me-mcp/web` (which also builds `packages/core` and
`packages/career-data`, `apps/web`'s workspace dependencies) followed by
`pnpm --filter @hire-me-mcp/web start`, and waits for it to respond before running specs. Chromium
is the only project configured — this is a smoke check, not a cross-browser matrix. Traces and
screenshots are captured on first retry only; retries are enabled on CI (2) and disabled locally
(0), matching Vitest's "fast and deterministic locally, resilient in CI" split.

```bash
pnpm test:e2e             # playwright test — builds + starts apps/web in production mode, runs the smoke spec
pnpm test:e2e:ui          # playwright test --ui — interactive UI mode for authoring/debugging specs
pnpm exec playwright show-report   # open the last HTML report (playwright-report/index.html)
```

First-time setup needs the Chromium binary once: `pnpm exec playwright install --with-deps
chromium` (CI does this itself, browser-cached across runs). Playwright's output directories
(`playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`) are git-ignored — no
browser binaries or run artifacts are ever committed.

## Preview gates: e2e + Lighthouse against a deployed URL

Two further gates run against an already-**deployed** URL — a Vercel preview in CI, or any
arbitrary origin locally — rather than a server either of them boots itself. Both are runnable
locally against any `BASE_URL`:

```bash
# 1. Have something running at BASE_URL, e.g. a local production build:
pnpm test:e2e   # builds + starts apps/web on http://127.0.0.1:3100 and runs the smoke spec, leaving the server up if reuseExistingServer applies — or just run `pnpm --filter @hire-me-mcp/web build && pnpm --filter @hire-me-mcp/web start -p 3100` directly

# 2. Playwright preview gate — navigation, project filters, theme persistence,
#    content-correctness spot checks (against packages/career-data/packages/core),
#    axe accessibility scans, responsive/no-horizontal-overflow checks, SEO artifacts:
BASE_URL=http://127.0.0.1:3100 pnpm test:e2e:preview
BASE_URL=http://127.0.0.1:3100 pnpm test:e2e:preview:ui   # interactive UI mode

# 3. Lighthouse budget gate — performance/accessibility/best-practices/SEO,
#    Core Web Vitals and JS/total resource-byte budgets, per page, on home,
#    one project detail, /privacy, the CV print view and /mcp:
BASE_URL=http://127.0.0.1:3100 pnpm run lighthouse

# 4. Latency budget gate — MCP read-tool + chat time-to-first-stream-event
#    percentile thresholds (#62):
BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test -c playwright.preview.config.ts apps/web/e2e-preview/specs/latency.spec.ts
```

Against a Vercel Deployment-Protection-guarded preview, also set
`VERCEL_AUTOMATION_BYPASS_SECRET` (the same value as the `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub
Actions secret — generated once in the Vercel project's Deployment Protection settings under
"Protection Bypass for Automation"): `BASE_URL=https://<preview>.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=<secret> pnpm test:e2e:preview`. Owner-approved decision (issue
#58): Standard Protection stays **on** for previews — CI authenticates instead of disabling it.
The bypass is applied two ways (`apps/web/e2e-preview/helpers/bypass.ts`): the
`x-vercel-protection-bypass` header on every `request`-fixture/API call
(`playwright.preview.config.ts`'s `extraHTTPHeaders`), and the
`?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true` query-param + cookie mode on
every real browser navigation (the `gotoRoute` fixture) — a header alone doesn't reliably survive
Vercel's own redirects for a full page load. The secret's value is never logged by either suite.

Specs live under `apps/web/e2e-preview/specs/*.spec.ts`, organized by concern (navigation,
content-correctness, accessibility, responsive, theme, project-filters, seo, mcp, latency) rather than by
route — `apps/web/e2e-preview/helpers/routes.ts` is the one place every route this suite covers is
listed. Content-correctness assertions (`content-correctness.spec.ts`) import `@hire-me-mcp/core`
**directly** in the test process (`apps/web/e2e-preview/helpers/dataset.ts`) — never
`apps/web/src/lib/content` (the `server-only`-guarded barrel every page reads through, and
unimportable from a plain Node/Playwright process anyway) — so they're a genuinely independent
second reader of `packages/career-data`: if a page component ever hardcodes or edits copy instead
of rendering what the content layer returns, the corresponding assertion fails.

The Lighthouse gate (`lighthouserc.json`, `scripts/lighthouse/`) asserts, per budgeted page (see
"Performance budgets (#62)" below for the full per-page matrix): `accessibility`/`best-practices`
category scores ≥ 0.9–0.95, `performance` ≥ 0.88–0.90 (kept slightly below the other categories —
#58/#128 stabilization, calibrated from a real cold-lambda-penalty failing run — plus a per-URL
warm-up request in CI as defense in depth), Core Web Vitals ceilings, and JS/total resource-byte
ceilings. Every individual SEO/structural audit (document title, meta description, canonical,
crawlable anchors, link text, etc.) is asserted at a perfect score — **except** two, both
deliberately excluded and both confirmed against a real Vercel preview run, not just locally:
`is-crawlable` (every preview deploy intentionally sets `noindex`) and `robots-txt` (Lighthouse
fetches it out-of-band, without the Deployment Protection bypass header, so it always hits the
protection interstitial on a gated preview — `robots.txt` validity is instead covered by
`apps/web/e2e-preview/specs/seo.spec.ts`).

**MCP endpoint smoke suite** (`apps/web/e2e-preview/specs/mcp.spec.ts`, #69). Drives the real
`@modelcontextprotocol/sdk` client against `${BASE_URL}/api/mcp`: a successful `initialize`
handshake, `tools/list` matching the real tool registry exactly, one successful `tools/call` per
career tool with citations present, an unregistered-tool call returning a real `McpError`, and
`RateLimit-*` header consistency under a small bounded burst. It is a SMOKE suite, not a
protocol-conformance one — schema-conformance depth lives in `apps/web/mcp-e2e/*.spec.ts` (#49,
see "Protocol-level MCP integration tests" below).

In CI (`.github/workflows/ci.yml`), the `preview-e2e` and `lighthouse` jobs run only on
`pull_request` (a push to `main` produces a Production deploy, not a Preview one), resolve the
PR's preview URL via the shared `.github/actions/resolve-vercel-preview` composite action, and skip
(rather than fail red) when `VERCEL_AUTOMATION_BYPASS_SECRET` is unavailable (fork PRs never
receive repo secrets) or no ready preview deployment is found within the timeout.

**Chat flow specs** (`chat-grounded.spec.ts`, `chat-gap.spec.ts`, `chat-guardrail-visibility.spec.ts`,
#73). Live alongside the other preview-gate specs. `chat-grounded.spec.ts`/`chat-gap.spec.ts` open
the chat widget and drive it through a grounded question (must stream an answer with a resolving
`[cite:...]` link) and a gap question (must produce an honest acknowledgement, every experience
claim outside it cited, using the same shared citation parser the eval scorer uses). They make two
real free-tier model calls per `preview-e2e` run — see `packages/agent/README.md`'s quota-rationale
table for the full budget picture. `chat-guardrail-visibility.spec.ts` stubs `POST /api/chat` and
asserts the honest, guardrail-specific banner renders.

## Performance budgets (#62)

Part of #9. Extends the Lighthouse gate above from a fixed set of category/SEO assertions into a
full, **committed** performance-budget system covering both the browser experience and
server-side latency, so v1.0 quality can't regress silently after launch.

**The single source of truth is `performance-budgets.json` (repo root).** It has two sections:

- `lighthouse` — records the pages budgeted and the v1.0 baseline category scores measured
  against a real preview. The actually-*enforced* thresholds live in `lighthouserc.json` (LHCI's
  own config schema, which `performance-budgets.json` can't replace) via `assert.assertMatrix`:
  each budgeted page (`/`, `/projects/<slug>`, `/privacy`, `/cv/print`, `/mcp`) gets its own
  `categories:performance`/`accessibility`/`best-practices` minimums, Core Web Vitals ceilings
  (`largest-contentful-paint`, `cumulative-layout-shift`, `total-blocking-time`), and resource-byte
  ceilings (`resource-summary:script:size`, `resource-summary:total:size`) — different pages
  deliberately carry different budgets (e.g. the CV print view has a much tighter byte budget than
  the home page). A handful of SEO/structural audits (`document-title`, `http-status-code`,
  `link-text`, `crawlable-anchors`) are asserted globally across every page; `meta-description`/
  `hreflang`/`canonical` are asserted per-page, excluding `/cv/print` (a print utility route,
  deliberately not indexed).
- `latency` — the MCP read-tool and chat endpoint latency thresholds, percentile method, sample
  sizes, and warm-up counts, consumed directly (not just documented) by
  `apps/web/e2e-preview/specs/latency.spec.ts`.

**MCP + chat latency assertions** (`apps/web/e2e-preview/specs/latency.spec.ts`, runs inside the
`preview-e2e` CI job — see below): one warm-up call per tool/endpoint (discarded, so a cold Lambda
invocation never pollutes the sample), then `sampleCalls` timed calls, asserting the
`percentile`-th value (computed by `apps/web/lib/perf/percentile.ts`, unit-tested independently)
stays under `thresholdMs`. MCP read tools (`get-profile`, `get-experience`, `search-projects`,
`get-skill-evidence`) are timed as raw `tools/call` JSON-RPC POSTs (not the SDK client, so a
connection handshake never leaks into the measured duration). Chat is timed as
**time-to-first-stream-event** — the first byte of the `POST /api/chat` response body, not full
completion — because free-tier `gemini-3.5-flash-lite` first-token latency is volatile (#169) and
this is the metric with real, budgetable margin. The chat case's `warmupCalls + sampleCalls` is
capped at `maxCallsPerCiRun` (currently 6) to keep this spec's own contribution to the shared 15
RPM Gemini quota bounded — see `packages/agent/README.md`'s quota-rationale table for the full
picture across every Gemini-calling spec in `preview-e2e`.

**Changing a budget deliberately.** A budget change (tightening OR loosening a threshold) must be
its own small, reviewed commit to `performance-budgets.json` and/or `lighthouserc.json` — never
bundled silently into an unrelated feature commit, and never done by editing the enforcement
scripts (`scripts/lighthouse/build-config.mjs`, `apps/web/e2e-preview/specs/latency.spec.ts`)
instead of the config. If a change tightens a threshold, re-run the affected gate against a real
preview first (commands above) to confirm it still passes before committing — the whole point of
"enforced" is that a report-only run that nobody looks at doesn't count (see #62's issue body). If
CI flags a check as unstable, the fix is a tighter measurement method (more runs, a warm-up, the
median already in use) — never a loosened budget to paper over flakiness.

In CI, both gates run inside jobs already scoped to `pull_request` previews: the `lighthouse` job
(`.github/workflows/ci.yml`) uploads its full report (`.lighthouseci/`) as a `lighthouse-report`
artifact and prints a category-score summary to the job's `$GITHUB_STEP_SUMMARY`
(`scripts/lighthouse/print-scores.mjs`); `latency.spec.ts`'s own `preview-e2e` job prints each
tool/endpoint's measured percentile, threshold, and raw sample to the Playwright report (and the
job log) so a regression is diagnosable without a local rerun.

## Protocol-level MCP integration tests (SDK client)

A third, separate suite drives the real `/api/mcp` endpoint with the real
`@modelcontextprotocol/sdk` client over Streamable HTTP, against a **locally started production
server** — black-box, never importing the route handlers directly. This is the layer above
`apps/web/app/api/mcp/route.test.ts` (an in-process Vitest suite): this suite catches transport,
serialization, and MCP-server schema-registration bugs that only show up when the app is actually
built and running as its own process. It never asserts exact career content strings —
`packages/career-data` is real, unstubbed content, so assertions are structural.

Own command, own config, own CI job — never runs as part of `pnpm test`/`pnpm turbo test`:

```bash
pnpm test:mcp             # builds apps/web once, then runs the suite against real next start servers
pnpm --filter web test:mcp   # same, scoped to apps/web directly
```

Layout, under `apps/web/`: `vitest.mcp.config.ts` (its own config, `mcp-e2e/**/*.spec.ts`),
`mcp-e2e/support/next-server.ts` (starts `next start` on a fresh ephemeral port and tears it down
afterward), `mcp-e2e/protocol.spec.ts` (the default-config server: `initialize`, `tools/list`, all
four career tools, error shapes), `mcp-e2e/rate-limit.spec.ts` (its own server with a deliberately
low rate limit, asserting a burst produces a 429 and the server recovers once the window elapses).

**Rate-limit testing without Upstash credentials.** CI never has Upstash credentials, and
`createRateLimiter`'s fail-open path deliberately always returns `success: true` when they're
absent — by design, so the endpoint never 500s for want of Redis. `MCP_TEST_RATE_LIMITER=1` swaps
in a deterministic, in-memory, hermetic limiter for tests — never set in production, preview, or
the default-config server.

## Release readiness certification (`pnpm certify:production`) — #76

One command runs the **entire** pyramid above — unit, Neon integration, e2e smoke, MCP protocol,
retrieval evals, agent evals, the full deployed-URL suite and the Lighthouse gate — against the
production configuration and domain, and reports a single pass/fail. In CI it's the manually
dispatched **Release Readiness** workflow (`.github/workflows/release-readiness.yml`, same
`gemini-free-tier` concurrency group as the other model-calling jobs). The committed checklist —
what "green" means at each level, the per-surface coverage inventory, and the
production-safety/no-pollution rationale — lives in
[`docs/release-readiness.md`](release-readiness.md).

## Pre-commit hooks (lefthook)

[lefthook](https://lefthook.dev) is the **tool-agnostic** enforcement layer: a `pre-commit` hook
that formats/lints staged files with Biome and runs Vitest for the packages affected by the staged
changes, so a commit with a Biome violation or a broken test never reaches CI in the first place.
It binds every contributor and every agent (Claude Code, Codex, or a human at the keyboard)
equally, regardless of whether any editor- or agent-level hook is honoured — see `lefthook.yml` at
the repo root for the full job config.

Installation is automatic: `pnpm install` runs `lefthook install --force` via the root `prepare`
script, so a fresh clone is protected after one install with no manual step.

Pre-commit runs two jobs in parallel:

- **`biome`** — `biome check --write --staged` over staged files only. Fixes it applies are
  automatically re-staged (`stage_fixed: true`).
- **`tests`** — `pnpm turbo run test --filter="[HEAD]"`, scoped to only the packages that
  themselves have staged/uncommitted changes (not their dependents).

Only `pre-commit` is defined — no `commit-msg` and no `pre-push`. Playwright/E2E never runs on
pre-commit, on any hook — that's CI-only.

**Emergency bypass** — CI re-checks everything, so this is safe to use when you need to get a
commit out and fix follow-up locally, but it is not a substitute for fixing the underlying failure:

```bash
git commit --no-verify -m "..."   # skip hooks for this commit only
LEFTHOOK=0 git commit -m "..."    # same effect, explicit env var
```

`pnpm validate:lefthook` (`scripts/lefthook/validate-config.mjs`) asserts `lefthook.yml` parses and
defines the `biome` and `tests` pre-commit jobs with the expected shape.

## Test-first enforcement (Claude Code hooks)

Coding agents working in this repo — Claude Code in particular — are pushed into a test-first loop
by three layers of enforcement; the full explanation of why all three exist lives in
[`AGENTS.md`](../AGENTS.md#three-layers-of-enforcement), the rules themselves in
[`.claude/rules/`](../.claude/rules), and the mechanism below.

**`.claude/hooks/`** (Claude Code specific, registered in `.claude/settings.json`):

| Hook | Event | What it does |
| --- | --- | --- |
| `tdd-pre-edit-guard.sh` | `PreToolUse` (Edit/Write/MultiEdit) | Blocks (exit 2) creating/editing an enforced source file (`apps/*/{src,app}/**/*.ts(x)`, `packages/*/src/**/*.ts(x)`) unless its co-located test file (`src/foo.ts` → `src/foo.test.ts`) exists **and** currently fails. Also blocks edits that weaken a test file. |
| `tdd-pre-bash-guard.sh` | `PreToolUse` (Bash) | Blocks `rm` / `git rm` / `unlink` commands that target a `*.test.ts(x)` path. |
| `tdd-post-edit-tests.sh` | `PostToolUse` (Edit/Write/MultiEdit) | Non-blocking. Runs the nearest test file plus a Biome check on the edited file. |
| `tdd-stop-guard.sh` | `Stop` | Blocks (exit 2) ending the session if any package touched by uncommitted changes has a failing test or a dirty `biome check`. |

All four hooks are hermetic (only local `tsx`/`vitest`/`biome` binaries — no network) and bounded.
The allow/block decision logic lives in a tested TypeScript module, **`tooling/tdd-guard`**:
`pathMapping.ts` maps a source path to its expected test path, `testContentAnalysis.ts` detects
test-weakening edits, and `decision.ts` combines both into a pure `decide()` function the hooks
shell out to.

`TDD_SKIP_GUARD=1` skips the three enforcing hooks for a single command — a narrow, documented
escape hatch for genuine exceptions, not a routine bypass (lefthook pre-commit plus CI still
enforce a green suite regardless).

## Continuous integration and branch protection

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on every
push to `main`, with five jobs:

- **`quality`** — Biome check, typecheck, career-data validate/lint, unit tests, build, and the
  `generate:connect --check` gate (#17/#23), as separately visible steps.
- **`e2e`** — runs in parallel with `quality`, installs Chromium, runs `pnpm test:e2e` (the
  Playwright smoke spec against a production build).
- **`mcp-integration`** — also runs in parallel with `quality`. A single step, `pnpm test:mcp`.
- **`preview-e2e`** and **`lighthouse`** (`pull_request` only) — the real product e2e suite and the
  Lighthouse gate, both run against the PR's actual Vercel preview deployment.
- **`db-integration`** (#14, #24) — runs `packages/core`'s real-Neon integration suites (see
  "Database integration tests" above) with `NEON_API_KEY`/`NEON_PROJECT_ID` available. Not in the
  required-status-checks list: like `agent-evals`/the `docs-rot-*` jobs, a Neon API hiccup or a
  fork PR (no repo secrets) skipping shouldn't block every unrelated PR from merging.

A SIXTH, separate workflow, [`.github/workflows/agent-evals.yml`](../.github/workflows/agent-evals.yml)
(`agent-evals`) gates the interview agent's honesty guarantees on real, budget-capped model output
— `pnpm eval:agent`, failing the build when a scorer aggregate (groundedness/gap honesty/relevance)
drops below its committed threshold. Since #207 it runs on **every** pull request (and every push
to `main`) and decides in-job whether to spend real Gemini quota — see "What triggers the eval
workflows" just below. It always attaches a PR status (so it *could* become required — #176), but
stays **not** in the required-status-checks list for the same fork-PR reason as `db-integration`
(no repo secrets → the skip must not block unrelated merges) — see `packages/agent/README.md`'s
"Running evals in CI" section.

### What triggers the eval workflows (#207)

Both Gemini-spending eval workflows (`agent-evals`, `retrieval-eval`) trigger on every PR and
decide **in-job** whether to run the real suite, via the shared
[`scripts/ci/eval-relevance.mjs`](../scripts/ci/eval-relevance.mjs) (unit-tested:
`pnpm ci:eval-relevance:test`). A run happens when ANY of these is true:

1. **Turborepo dependency graph** — `turbo query`'s `affectedPackages`, computed against the PR's
   merge base, contains the workflow's target package (`@hire-me-mcp/agent` for agent-evals,
   `@hire-me-mcp/core` for retrieval-eval). Because turbo's affected set includes transitive
   dependents of every changed package (and attributes lockfile changes per-package), "a
   dependency of the agent changed" is caught with no hand-maintained path list — the failure
   mode of the earlier glob/filename-convention approaches.
2. **Explicit asset regex** — for files the module graph can't see: the workflow file itself, the
   CI helper scripts, career-data content, the chat-route wiring. Each workflow declares its own
   `EXTRA_PATH_REGEX`.
3. **The `run-evals` PR label** — the override: label the PR and both workflows run their full
   suites regardless of the diff. Adding the label fires fresh runs (the `labeled` trigger type);
   labels are also re-read live from the API, so re-running an existing job after labeling works
   too. `workflow_dispatch` remains the non-PR override.

The decision **fails open**: any detection error (git, `turbo query`, output parsing) runs the
evals rather than silently skipping a gate. Irrelevant PRs report green in seconds with zero
model calls — never a workflow-level `paths:` filter, which would permanently block PRs on a
required check that never reports (#176).

A SEVENTH workflow, [`.github/workflows/docs-rot.yml`](../.github/workflows/docs-rot.yml) (#59),
makes documentation rot impossible to merge or leave running unnoticed: two independent jobs,
`docs-rot-snippets` and `docs-rot-links`, run on every pull request (against the PR's Vercel
preview), on every push to `main`, and on a daily `06:17 UTC` schedule (both also accept
`workflow_dispatch`) — always against a real, currently-deployed origin, never localhost.

- **`docs-rot-snippets`** — parses the generated regions already published in `README.md` and
  `docs/mcp.md` (the endpoint URL, the Claude Code CLI command, the Cursor/VS Code JSON config, the
  tool table, and the raw curl healthcheck) and executes what they describe: a real JSON-RPC
  `initialize` + `tools/list` handshake, a real `claude mcp add`/`list`/`remove` round trip when the
  `claude` CLI is available (installed best-effort in CI; falls back to structural-only validation,
  documented as a deviation, when it isn't), and a parse + endpoint/transport cross-check for the
  JSON client config. It also fetches `/.well-known/mcp.json` and `/llms-full.txt` **from the target
  deployment itself** (not a checked-in copy) and cross-checks their tool lists against the live
  `tools/list` response. Every URL any of this touches comes from parsing one of those documents —
  none is re-typed in the workflow or the script — so a stale/bogus documented endpoint fails the
  job instead of silently passing (proved by a fixture-server test,
  `scripts/ci/docs-rot/extract-artifacts.test.mjs`).
- **`docs-rot-links`** — crawls every Markdown file in the repo plus every page of the deployed site
  (breadth-first from `/`, seeded with `/llms.txt`'s own links), checking every discovered URL (HEAD
  falling back to GET, retried with exponential backoff) and failing on 4xx/5xx. A documented,
  reviewed ignore list (`scripts/ci/docs-rot/ignore-list.json`, currently empty) exempts
  known-flaky/rate-limiting hosts from failing the job without silencing them entirely (a hit still
  prints as a warning). Deliberately a separate job from `docs-rot-snippets` so a dead external link
  can never mask a broken MCP snippet, or vice versa.

Both scripts are plain Node with no npm dependencies, so — unlike every other job in this file —
neither needs a `pnpm install` step; only `.nvmrc`-pinned Node itself. Both are runnable locally
against **any** deployment (a preview, production, or a local dev/production server) with one
command each:

```bash
pnpm docs-rot:snippets --target-url=https://hire-me-mcp-web.vercel.app
pnpm docs-rot:links --target-url=https://hire-me-mcp-web.vercel.app

# Against a Vercel Deployment-Protection-guarded preview, same bypass convention as preview-e2e:
VERCEL_AUTOMATION_BYPASS_SECRET=<secret> pnpm docs-rot:snippets --target-url=https://<preview>.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=<secret> pnpm docs-rot:links --target-url=https://<preview>.vercel.app

# Unit tests for the extraction/checking logic itself (no network target needed):
pnpm docs-rot:test
```

Both jobs use the same `resolve-vercel-preview` composite action and fork-PR/no-ready-preview
skip-with-message pattern as `preview-e2e`/`lighthouse` above, per the shared-infrastructure review
note on #58/#59 — no third copy of the preview-polling logic. Neither job is in the
required-status-checks list below yet: they're a docs-rot **guard** (loud, actionable failures on
`main`/schedule/every PR), not a merge gate, so a preview that hasn't warmed up yet within the
timeout skips rather than blocking a PR — see the note on `agent-evals` above for the same
reasoning applied to a path-filtered job.

An EIGHTH workflow, [`.github/workflows/retrieval-eval.yml`](../.github/workflows/retrieval-eval.yml)
(#41/#52, epic #6), runs `pnpm eval:retrieval` (see "Retrieval evals" above) for real, as a
**required PR check** (see "How re-indexing works" above for the full PR-loop description): it
provisions its own throwaway Neon branch (`NEON_API_KEY`/`NEON_PROJECT_ID`, same helper
`db-integration` and the `search-career`/`ingest` integration suites use), runs migrations and
`pnpm ingest` against it with the real `GOOGLE_GENERATIVE_AI_API_KEY` secret, runs the eval, writes
the aggregate metrics vs. thresholds and the pass/fail verdict to the job summary
(`scripts/ci/retrieval-eval/summary.mjs`), uploads the JSON report as a build artifact, and deletes
the branch in an `always()` step regardless of outcome. Triggered on `pull_request` for paths that
can change what gets indexed or how retrieval scores (`packages/core/**`, the career-data content,
the workflow/helper script), plus `workflow_dispatch` for an on-demand full run — not on every PR
unconditionally, since a still-new eval suite making real embedding calls on every unrelated PR
would be needless cost even though ingestion's incremental behavior keeps the marginal cost near
zero once content is unchanged. Shares the job-level `gemini-free-tier` concurrency group with
`agent-evals`/`preview-e2e` (below) — see that group's own note for why a job can be cancelled
while queued and what to do about it. Skips (rather than fails red) on fork PRs, same pattern as
`db-integration`.

A NINTH workflow, [`.github/workflows/reindex-production.yml`](../.github/workflows/reindex-production.yml)
(#52), is the production loop: on every push to `main` touching the same paths, it runs migrations
and a real, incremental `pnpm ingest` directly against production's `DATABASE_URL` — no Neon
branch — failing loudly on a permanent ingest error rather than leaving a stale/partial index. Also
in the `gemini-free-tier` concurrency group. Deliberately **not** wired into Vercel's own build —
see "How re-indexing works" above and `docs/deployment.md`'s "CI vs. Vercel" section.

A TENTH workflow, [`.github/workflows/neon-branch-cleanup.yml`](../.github/workflows/neon-branch-cleanup.yml)
(#52), is the stale-branch safety net: a daily scheduled job (plus `workflow_dispatch`) that runs
`scripts/ci/neon-branch-cleanup.mjs` to delete any `hire-me-mcp-`-prefixed Neon branch older than
24h that a run's own `always()` cleanup step missed, explicitly refusing to touch the project's
`default`/`protected` branch. See "How re-indexing works" above for the manual-run command.

None of `agent-evals`/`db-integration`/`neon-branch-cleanup`/`reindex-production` are (or should
be) in the required-status-checks list: `agent-evals` and `neon-branch-cleanup` are path-filtered
or scheduled and would otherwise block PRs they never run on; `db-integration` and
`reindex-production` are defense-in-depth/production-side jobs, not merge gates in their own
right — retrieval quality is what a PR must prove, and `retrieval-eval` is the check that proves
it. `retrieval-eval` **is** intended to join the required-status-checks list below (#52) — updating
live branch protection is a separate, deliberate step (see the `gh api` command below) taken once
the workflow above has a real green run to point at, not part of this doc edit.

- Node is pinned via `.nvmrc`; pnpm is installed via `pnpm/action-setup`, reading the version from
  the root `packageManager` field.
- Dependencies install with `pnpm install --frozen-lockfile`, so a stale lockfile fails CI instead
  of silently drifting.
- The pnpm store and the Turborepo cache (`.turbo`) are cached across runs.
- `concurrency` cancels a previous in-flight run for the same ref when a new commit is pushed.
- CI is the remote mirror of the lefthook pre-commit gate: anything pre-commit rejects locally must
  also fail here, so `--no-verify` doesn't let a violation reach `main`.

`main` is protected to match: no direct pushes, no force pushes, and `quality`, `e2e`,
`mcp-integration`, `preview-e2e` and `lighthouse` must all pass before a PR can merge — this is the
**current live configuration**. This was configured once, by hand, by PUTting a JSON body (the
branch protection endpoint rejects `gh api -f/-F` key-path syntax for this nested shape, so a body
file is the reliable way to reproduce it):

```bash
cat > branch-protection.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "quality" },
      { "context": "e2e" },
      { "context": "mcp-integration" },
      { "context": "preview-e2e" },
      { "context": "lighthouse" }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

gh api repos/garusis/hire-me-mcp/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input branch-protection.json
```

**Target state (#52, not yet applied):** `retrieval-eval` is intended to join the `checks` array
above once `retrieval-eval.yml`'s new required-check trigger has a real green (and a real
threshold-failing red) run to point at — add `{ "context": "retrieval-eval" }` to the array and
re-run the same PUT. This is a deliberate, separate step taken after this PR's own runs have
demonstrated the check, not part of merging this documentation change.

Verify the live configuration at any time with:

```bash
gh api repos/garusis/hire-me-mcp/branches/main/protection
```
