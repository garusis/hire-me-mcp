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

`packages/core/src/db/rag-store.integration.test.ts` (#14, epic #6) is part of the normal
`pnpm test` / `pnpm turbo test` suite — Vitest picks it up like any other `*.test.ts` — but it's
gated on Neon API credentials rather than always running against a shared database. Full writeup,
including the embedding-dimension/distance-metric ADR and driver choice, lives in
[`packages/core/README.md`](../packages/core/README.md#database-neon-pgvector-store); the short
version:

- Set `NEON_API_KEY` and `NEON_PROJECT_ID` (a personal Neon API key with access to the project) to
  run it for real — it creates a throwaway Neon branch, runs migrations against it, and deletes it
  on teardown (including on failure).
- Either missing (the default for local dev and most CI jobs) makes the suite skip with a clear
  console message — never silently, never a hard failure for contributors without Neon
  credentials.
- CI runs it in its own job, `db-integration` (`.github/workflows/ci.yml`), separate from
  `quality` so a slow/flaky Neon branch-provisioning call never blocks the required checks. Like
  `preview-e2e`/`lighthouse`, it skips (rather than fails red) when the required secrets aren't
  available — the case for fork PRs, which never receive repo secrets.

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

# 3. Lighthouse gate — performance/accessibility/best-practices/SEO on home,
#    one project detail, and /mcp:
BASE_URL=http://127.0.0.1:3100 pnpm run lighthouse
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
content-correctness, accessibility, responsive, theme, project-filters, seo, mcp) rather than by
route — `apps/web/e2e-preview/helpers/routes.ts` is the one place every route this suite covers is
listed. Content-correctness assertions (`content-correctness.spec.ts`) import `@hire-me-mcp/core`
**directly** in the test process (`apps/web/e2e-preview/helpers/dataset.ts`) — never
`apps/web/src/lib/content` (the `server-only`-guarded barrel every page reads through, and
unimportable from a plain Node/Playwright process anyway) — so they're a genuinely independent
second reader of `packages/career-data`: if a page component ever hardcodes or edits copy instead
of rendering what the content layer returns, the corresponding assertion fails.

The Lighthouse gate (`lighthouserc.json`, `scripts/lighthouse/`) asserts `accessibility`/
`best-practices` category scores ≥ 0.95, plus every individual SEO audit (document title, meta
description, canonical, crawlable anchors, link text, etc.) at a perfect score — **except** two,
both deliberately excluded and both confirmed against a real Vercel preview run, not just locally:
`is-crawlable` (every preview deploy intentionally sets `noindex`) and `robots-txt` (Lighthouse
fetches it out-of-band, without the Deployment Protection bypass header, so it always hits the
protection interstitial on a gated preview — `robots.txt` validity is instead covered by
`apps/web/e2e-preview/specs/seo.spec.ts`). `performance` is asserted at ≥ 0.90 against previews
(#58/#128 stabilization, calibrated from a real cold-lambda-penalty failing run) rather than the
0.95 the other categories use; a full production-config Lighthouse run against a warm deployment is
tracked for #62/epic 9.

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
- **`db-integration`** (#14) — runs `packages/core`'s real-Neon integration suite (see "Database
  integration tests" above) with `NEON_API_KEY`/`NEON_PROJECT_ID` available. Not in the
  required-status-checks list: like `agent-evals`/the `docs-rot-*` jobs, a Neon API hiccup or a
  fork PR (no repo secrets) skipping shouldn't block every unrelated PR from merging.

A SIXTH, separate workflow, [`.github/workflows/agent-evals.yml`](../.github/workflows/agent-evals.yml)
(`agent-evals`) gates the interview agent's honesty guarantees on real, budget-capped model output
— `pnpm eval:agent`, failing the build when a scorer aggregate (groundedness/gap honesty/relevance)
drops below its committed threshold. It is path-filtered (`packages/agent/**`, `packages/core/**`,
`packages/career-data/content/**`, the chat route) plus `workflow_dispatch`, and deliberately **not**
in the required-status-checks list below (a path-filtered job that never runs would otherwise block
every unrelated PR) — see `packages/agent/README.md`'s "Running evals in CI" section for the full
rationale.

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

- Node is pinned via `.nvmrc`; pnpm is installed via `pnpm/action-setup`, reading the version from
  the root `packageManager` field.
- Dependencies install with `pnpm install --frozen-lockfile`, so a stale lockfile fails CI instead
  of silently drifting.
- The pnpm store and the Turborepo cache (`.turbo`) are cached across runs.
- `concurrency` cancels a previous in-flight run for the same ref when a new commit is pushed.
- CI is the remote mirror of the lefthook pre-commit gate: anything pre-commit rejects locally must
  also fail here, so `--no-verify` doesn't let a violation reach `main`.

`main` is protected to match: no direct pushes, no force pushes, and `quality`, `e2e`,
`mcp-integration`, `preview-e2e` and `lighthouse` must all pass before a PR can merge. This was
configured once, by hand, by PUTting a JSON body (the branch protection endpoint rejects
`gh api -f/-F` key-path syntax for this nested shape, so a body file is the reliable way to
reproduce it):

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

Verify the live configuration at any time with:

```bash
gh api repos/garusis/hire-me-mcp/branches/main/protection
```
