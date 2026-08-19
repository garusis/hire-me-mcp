# Hire-me MCP — Portfolio as an API

> Status: idea. The flagship identity project of the portfolio.

## The idea

A portfolio that **is** an API. Instead of a static "about me" page, this is a living, queryable representation of who I am as an engineer:

- A polished portfolio site (bio, experience, projects, writing).
- An embedded chat where visitors "interview" an AI agent grounded in my real career data (CV, project history, code samples, this portfolio itself).
- An **MCP server endpoint** (e.g. `mcp.marcosalvarez.dev`) that recruiters and engineers can plug into Claude, ChatGPT, or any MCP client and interrogate directly: *"Has Marcos worked with event-driven architectures? Show me evidence."*

The hook: nobody else's CV can be added as a tool to your AI assistant.

## What it focuses on

- **MCP protocol**: a real, public, OAuth-optional MCP server with well-designed tools (`get_experience`, `search_projects`, `get_skill_evidence`, `contact`).
- **RAG done right**: career data chunked and embedded; answers grounded and cited (which job, which project, which repo), no hallucinated experience.
- **Agent UX**: the on-site chat and the MCP server share the same domain layer — one source of truth, two interfaces.
- **Polish**: this is the first thing anyone sees. Design quality matters as much as the tech.

## Skills it must highlight

- MCP server design and implementation (mirrors mcp-gateway-service experience).
- LLM integration: RAG, embeddings, grounded generation with citations.
- TypeScript / Next.js full-stack.
- Product thinking: turning a CV into a product.
- Clean domain modeling: one career-data model serving site, chat, and MCP.

## Rough stack (free tier)

- Next.js 15 on Vercel.
- Vercel AI SDK for chat streaming.
- `mcp-handler` (Vercel MCP adapter) for the MCP endpoint.
- Neon Postgres + pgvector (or Upstash Vector) for embeddings.
- Free-tier LLM (Gemini / Groq) or Claude Haiku for generation.

## MVP scope

1. Career data as structured content (JSON/MDX) — the single source of truth.
2. Portfolio site rendering that data.
3. MCP server with 3–4 read tools over the same data.
4. On-site chat grounded in the same data, with citations.

Later: analytics on what recruiters ask, a `contact`/`book_call` tool (write action), downloadable CV generated from the data.

## Workspace

A pnpm + Turborepo monorepo. Node >= 22 (CI and Vercel run 24), pnpm 10 (pinned via `packageManager`).

```
apps/
  web/              Next.js 15 App Router app (site, chat, and — later — the MCP endpoint)
packages/
  core/              Framework-free domain layer, consumed by apps/web
  career-data/       Zod-typed career content (schemas land in a later task)
```

`apps/web` depends on `packages/core` and `packages/career-data` via the `workspace:*` protocol — no `tsconfig` path hacks. `packages/core` stays free of React/Next.js/HTTP-framework dependencies since it will also back the future public MCP endpoint. All packages extend the shared `tsconfig.base.json` (`strict: true`).

### Commands

Run from the repo root:

```bash
pnpm install              # install all workspace dependencies
pnpm build                # turbo run build — builds all packages
pnpm dev                  # turbo run dev — runs all dev servers
pnpm typecheck             # turbo run typecheck
pnpm lint                  # turbo run lint
pnpm test                  # turbo run test
pnpm --filter web dev      # run only the web app's dev server (http://localhost:3000)
```

Pre-commit hooks are documented below; CI and deployment are wired up in later tasks of the [Foundation & Agentic DX epic](https://github.com/garusis/hire-me-mcp/issues/1).

### Linting and formatting (Biome)

[Biome](https://biomejs.dev) is the **single** linter and formatter for the whole repo — there is no ESLint or Prettier anywhere, and none should be added. A single root `biome.json` configures formatting and linting for every workspace package; packages inherit it rather than duplicating rules.

```bash
pnpm lint                  # turbo run lint — biome check in every package (fans out, cacheable)
pnpm --filter web lint     # lint a single package
pnpm format                # biome format --write . — format the whole repo
pnpm format:check          # biome format . — check formatting without writing
pnpm biome check .         # run Biome directly across the whole repo (format + lint + import sort)
```

Strict rules are enforced at `error` severity, not `warn`: no explicit or implicit `any` (`noExplicitAny`, `noImplicitAnyLet`), cognitive complexity limits (`noExcessiveCognitiveComplexity`), no unused imports/variables, and organized imports enforced as part of `biome check`. Named exports are preferred over default exports (`noDefaultExport`); the only exception is Next.js App Router files that the framework requires to use a default export (`page.tsx`, `layout.tsx`, `route.ts`, etc. under `apps/web/app/**`, plus `next.config.ts`), which are excluded via a `biome.json` override.

If you use VS Code, install the [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) — `.vscode/settings.json` already sets it as the default formatter with format-on-save, so editor and agent edits converge on the same output.

### Testing (Vitest)

[Vitest](https://vitest.dev) is the unit/integration test runner for the whole repo. A shared base config (`vitest.config.base.ts`, root) sets the test file convention, exclusions, and coverage settings; each package's `vitest.config.ts` extends it via `mergeConfig`, adding only what differs — `environment: "node"` for `packages/*`, `environment: "happy-dom"` plus the `@vitejs/plugin-react` plugin for `apps/web` (App Router components need JSX/React support; `happy-dom` is a pure-JS DOM implementation, so no browser is ever downloaded or launched — Playwright/e2e is a separate command, documented below). Coverage uses the `v8` provider; no hard threshold is enforced yet, so `test:coverage` just has to run clean and print a report.

**Test file convention — co-located `*.test.ts` / `*.test.tsx` next to the source file they exercise** (e.g. `src/index.ts` → `src/index.test.ts`, `app/page.tsx` → `app/page.test.tsx`). This is chosen over a parallel `tests/` directory because it keeps a 1:1, greppable mapping between a source file and its test with no path translation — `path/to/foo.ts` always has its test at `path/to/foo.test.ts`, which is exactly the deterministic rule later TDD tooling needs to map one to the other.

```bash
pnpm test                        # turbo run test — vitest run in every package (cacheable)
pnpm --filter web test           # test a single package
pnpm --filter web test:watch     # watch mode for a single package (not run by turbo)
pnpm test:coverage        # turbo run test:coverage — vitest run --coverage everywhere
pnpm --filter web test:coverage  # coverage for a single package
```

### End-to-end tests (Playwright) — added in #36

[Playwright](https://playwright.dev) is the e2e runner, fully separate from Vitest: it owns its own command (`pnpm test:e2e`), its own config (`playwright.config.ts`, root), and its own CI job (`e2e` in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — `pnpm test` / `pnpm turbo test` never downloads or launches a browser, and `pnpm test:e2e` never runs Vitest. Specs live under `apps/web/e2e/*.spec.ts` (a `.spec.ts` suffix, not `.test.ts`, so Vitest's `include` globs never pick them up), currently one smoke spec (`apps/web/e2e/home.smoke.spec.ts`) that asserts the scaffolded home page responds and its `<h1>` heading is visible.

The suite targets a **production build**, not the dev server: Playwright's `webServer` option runs `pnpm turbo run build --filter=@hire-me-mcp/web` (which also builds `packages/core` and `packages/career-data`, `apps/web`'s workspace dependencies) followed by `pnpm --filter @hire-me-mcp/web start`, and waits for it to respond before running specs. Chromium is the only project configured — this is a smoke check, not a cross-browser matrix. Traces and screenshots are captured on first retry only; retries are enabled on CI (2) and disabled locally (0), matching Vitest's "fast and deterministic locally, resilient in CI" split.

```bash
pnpm test:e2e             # playwright test — builds + starts apps/web in production mode, runs the smoke spec
pnpm test:e2e:ui          # playwright test --ui — interactive UI mode for authoring/debugging specs
pnpm exec playwright show-report   # open the last HTML report (playwright-report/index.html)
```

First-time setup needs the Chromium binary once: `pnpm exec playwright install --with-deps chromium` (CI does this itself, browser-cached across runs). Playwright's output directories (`playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`) are git-ignored — no browser binaries or run artifacts are ever committed.

### Pre-commit hooks (lefthook)

[lefthook](https://lefthook.dev) is the **tool-agnostic** enforcement layer: a `pre-commit` hook that formats/lints staged files with Biome and runs Vitest for the packages affected by the staged changes, so a commit with a Biome violation or a broken test never reaches CI in the first place. It binds every contributor and every agent (Claude Code, Codex, or a human at the keyboard) equally, regardless of whether any editor- or agent-level hook is honoured — see `lefthook.yml` at the repo root for the full job config.

Installation is automatic: `pnpm install` runs `lefthook install --force` via the root `prepare` script, so a fresh clone is protected after one install with no manual step. (`--force` makes install succeed even if your machine has a global `core.hooksPath` override — lefthook installs into whatever path git actually reads hooks from, not blindly into `.git/hooks`.)

Pre-commit runs two jobs in parallel:

- **`biome`** — `biome check --write --staged` (via `scripts/lefthook/biome-staged.sh`, which adds a bounded retry for an intermittent Biome 2.5.9 daemon crash — see the script for details) over staged files only. Fixes it applies are automatically re-staged (`stage_fixed: true`), so the commit contains the formatted result, not the pre-fix version.
- **`tests`** — `pnpm turbo run test --filter="[HEAD]"`, scoped to only the packages that themselves have staged/uncommitted changes (not their dependents). A `packages/core`-only commit never runs `apps/web`'s test suite, even though `apps/web` depends on `@hire-me-mcp/core`.

Only `pre-commit` is defined — no `commit-msg` (no commit-message linter exists yet to make one worthwhile) and no `pre-push` (it would either duplicate what `pre-commit` already checked or run the full/E2E suite, which belongs to CI). Playwright/E2E never runs on pre-commit, on any hook — that's CI-only, a separate task in the epic.

**Emergency bypass** — CI re-checks everything, so this is safe to use when you need to get a commit out and fix follow-up locally, but it is not a substitute for fixing the underlying failure:

```bash
git commit --no-verify -m "..."   # skip hooks for this commit only
LEFTHOOK=0 git commit -m "..."    # same effect, explicit env var
```

`pnpm validate:lefthook` (`scripts/lefthook/validate-config.mjs`) asserts `lefthook.yml` parses and defines the `biome` and `tests` pre-commit jobs with the expected shape (`stage_fixed: true`, turbo-filtered, Playwright-free) — a plain package script any CI pipeline can call directly.

### Continuous integration and branch protection

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on every push to `main`, with two jobs:

- **`quality`** — four separately visible steps (Biome check, typecheck, unit tests, build) so a failure is attributable at a glance.
- **`e2e`** (added in #36) — runs in parallel with `quality` (no `needs:`, so a broken page is always reported as an `e2e` failure rather than skipped because `quality` also failed), installs Chromium (`pnpm exec playwright install --with-deps chromium`, browser binaries cached by Playwright version), runs `pnpm test:e2e` (the Playwright smoke spec against a production build), and on failure uploads two artifacts: the Playwright HTML report (`playwright-report/`) and the trace/screenshot output (`test-results/`), both 7-day retention. `timeout-minutes: 15` fails the job fast instead of hanging if the production server never becomes ready. A broken home page fails this job and therefore fails the required check on the PR.

- Node is pinned via `.nvmrc`; pnpm is installed via `pnpm/action-setup`, which reads the version from the root `packageManager` field.
- Dependencies install with `pnpm install --frozen-lockfile`, so a stale lockfile fails CI instead of silently drifting.
- The pnpm store and the Turborepo cache (`.turbo`) are cached across runs, so an unchanged branch replays cached task output (`>>> FULL TURBO`) instead of re-running typecheck/test/build.
- `concurrency` cancels a previous in-flight run for the same ref when a new commit is pushed.
- CI is the remote mirror of the lefthook pre-commit gate (#18): anything pre-commit rejects locally must also fail here, so `--no-verify` doesn't let a violation reach `main`.

`main` is protected to match: no direct pushes, no force pushes, and both the `quality` and `e2e` checks must pass before a PR can merge. This was configured once, by hand, by PUTting a JSON body (the branch protection endpoint rejects `gh api -f/-F` key-path syntax for this nested shape, so a body file is the reliable way to reproduce it):

```bash
cat > branch-protection.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "quality" }, { "context": "e2e" }]
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

### Test-first enforcement (Claude Code hooks)

Coding agents working in this repo — Claude Code in particular — are pushed into a test-first
loop by three layers of enforcement; the full explanation of why all three exist lives in
[`AGENTS.md`](./AGENTS.md#three-layers-of-enforcement), the rules themselves in
[`.claude/rules/`](./.claude/rules), and the mechanism below.

**`.claude/hooks/`** (Claude Code specific, registered in `.claude/settings.json`):

| Hook | Event | What it does |
| --- | --- | --- |
| `tdd-pre-edit-guard.sh` | `PreToolUse` (Edit/Write/MultiEdit) | Blocks (exit 2) creating/editing an enforced source file (`apps/*/{src,app}/**/*.ts(x)`, `packages/*/src/**/*.ts(x)`) unless its co-located test file (`src/foo.ts` → `src/foo.test.ts`, per the convention above) exists **and** currently fails. The block message names the exact expected test path. Also blocks edits that weaken a test file — adding `.skip`/`.only`, removing test cases, or removing assertions. |
| `tdd-pre-bash-guard.sh` | `PreToolUse` (Bash) | Blocks `rm` / `git rm` / `unlink` commands that target a `*.test.ts(x)` path — closes the deletion bypass the Edit/Write hook can't see. |
| `tdd-post-edit-tests.sh` | `PostToolUse` (Edit/Write/MultiEdit) | Non-blocking. Runs the nearest test file plus a Biome check on the edited file, for immediate feedback. |
| `tdd-stop-guard.sh` | `Stop` | Blocks (exit 2) ending the session if any package touched by uncommitted changes has a failing test or a dirty (failing) `biome check`. Guards against re-blocking in the same turn via `stop_hook_active`. |

All four hooks are hermetic (only local `tsx`/`vitest`/`biome` binaries — no network, no `npx`
resolution) and bounded (`run_with_timeout` in `.claude/hooks/tdd-lib.sh`, a portable
kill-after-N-seconds wrapper, since macOS's built-in bash lacks GNU `timeout`). The actual
allow/block *decision logic* — not the shell glue — lives in a tested TypeScript module,
**`tooling/tdd-guard`**: `pathMapping.ts` maps a source path to its expected test path,
`testContentAnalysis.ts` detects test-weakening edits, and `decision.ts` combines both into a pure
`decide()` function the hooks shell out to via `tooling/tdd-guard/src/cli.ts`. It's a normal pnpm
workspace package (`pnpm --filter @hire-me-mcp/tdd-guard test`, covered by `pnpm turbo test`) with
Vitest coverage of the allow / block-no-test / block-test-deletion / block-`.only` cases (and
several more).

**Debugging a hook:** every hook reads Claude Code's PreToolUse/PostToolUse/Stop JSON payload from
stdin — pipe a representative payload into it directly:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"packages/core/src/foo.ts","old_string":"a","new_string":"b"}}' \
  | .claude/hooks/tdd-pre-edit-guard.sh; echo "exit=$?"
```

`TDD_SKIP_GUARD=1` skips `tdd-pre-edit-guard.sh`, `tdd-pre-bash-guard.sh`, and `tdd-stop-guard.sh`
for a single command — a narrow, documented escape hatch for genuine exceptions, not a routine
bypass (layer 3 — lefthook pre-commit, #18, plus CI — still enforces a green suite regardless).

## Deployment (Vercel) — #40

`apps/web` is one Vercel project for the whole monorepo — there is no separate API/service
deployment. The BFF, the public MCP endpoint (`mcp-handler`), and the embedded Mastra agent all
ship inside this same Next.js app in later epics.

**Live URL:** <https://hire-me-mcp-web.vercel.app> — production, deployed from `main`, verified
HTTP 200 with the expected page content (see "Current status" below).

### Project settings (reproduce by hand in the Vercel dashboard)

These are dashboard/Project Settings, not `vercel.json` — a monorepo root directory, install
command, and build command are all expressible through Project Settings, so no `vercel.json` is
committed. If a future requirement genuinely can't be expressed that way (e.g. custom headers,
rewrites), add a minimal `vercel.json` then and document why here.

| Setting | Value |
| --- | --- |
| Vercel project | `hire-me-mcp-web`, personal Hobby account `marcos-javier-alvarez-maestres-projects` (**not** the House Numbers team — see note below) |
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Install Command | default (Vercel detects `pnpm-workspace.yaml` + the root `packageManager` field via corepack and runs `pnpm install --frozen-lockfile` at the workspace root) |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@hire-me-mcp/web` (override — the default per-package `next build` would skip `packages/core` and `packages/career-data`; this is the same command CI and a clean local clone use, so the Vercel build is guaranteed to be the workspace build, not an isolated `next build`) |
| Output Directory | default (`apps/web/.next`, auto-detected for Next.js under Root Directory) |
| Node.js Version | project currently on Node 20 or older — Vercel is warning that builds on this version stop being supported after **2026-09-30**; the project's Node.js Version setting should be bumped to 22 or 24 before then (owner/dashboard action; tracked for #33/#57, not fixed by this doc-only change) |
| Git repository | `garusis/hire-me-mcp`, Production Branch `main` |
| Deployment Protection | **Standard Protection is on for Preview deployments** (Vercel's default) — a preview URL redirects (302) to `vercel.com/sso-api` for anyone not authenticated to the Vercel project instead of returning the page directly. Production is not protected. This is left as-is for now (not something this task changes) but matters for later preview-targeting e2e work (#58/#69), which will need either a bypass token or protection disabled on Preview. |
| Ignored Build Step | not configured — evaluated and deferred, see below |

Because the project lives under the owner's **personal Vercel account**, not the House Numbers
team, the Vercel MCP tooling used elsewhere in this repo's tasks cannot see or manage it (it's
scoped to House Numbers). Day-to-day Vercel operations for this project (settings changes,
env vars, protection toggles) go through the Vercel dashboard or CLI as the owner, not through
MCP/API automation.

Verify locally that the exact same command reproduces what Vercel builds, from a clean clone:

```bash
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@hire-me-mcp/web
```

The build log (local or on Vercel) must show `@hire-me-mcp/core` and `@hire-me-mcp/career-data`
building before `@hire-me-mcp/web` — that's the check that the deploy is going through Turborepo's
dependency graph rather than a bare `next build` in isolation.

Automation has no dashboard/log access to this personal-account project (see the MCP note above),
so this was verified indirectly instead of by reading the Vercel build log directly: the deployed
production page renders values that only exist if `@hire-me-mcp/core` and
`@hire-me-mcp/career-data` were actually built and bundled in —

```bash
curl -s https://hire-me-mcp-web.vercel.app/ | grep -o 'Domain package:.*package'
```

returns `Domain package: @hire-me-mcp/core` and `Career data package: @hire-me-mcp/career-data`,
which the page can only print by importing both workspace packages at build time. Combined with
the local `pnpm turbo run build --filter=@hire-me-mcp/web` run above (same command, same result),
this is the evidence that Vercel is building through Turborepo and not a bare `next build`.

### Environment variables

None are required yet (see `.env.example` at the repo root). The convention going forward:

- **Local development** — an untracked `apps/web/.env.local` (git-ignored; see `.gitignore`).
- **Preview / Production** — Vercel Project Settings → Environment Variables, scoped per
  environment. Real values are never committed; `.env.example` only ever holds commented
  placeholders (`NAME=`) for variables that exist.

### CI vs. Vercel — two independent gates

- **GitHub Actions CI** (`.github/workflows/ci.yml`, the `quality` check, #27) is the correctness
  gate: Biome, typecheck, unit tests, build. It runs on every PR and on `main`, and branch
  protection requires it to pass before merge. CI never deploys anything.
- **Vercel** is the deploy path only: it builds and deploys every push, independent of CI. A
  Vercel build failure shows up as a failed/red check on the PR (via the Vercel GitHub integration)
  but is a separate check from `quality` — it does not block the `quality` check from passing or
  running, and branch protection is not configured to require the Vercel check, so a red Vercel
  build cannot itself block a merge that CI has approved. Conversely, a red `quality` check has no
  effect on whether Vercel attempts a build. The two systems intentionally cannot block each other.

### Preview deployments

Every pull request against `garusis/hire-me-mcp` gets an automatic Vercel preview deployment on
its own `*.vercel.app` URL, posted as a deployment/check on the PR by the Vercel GitHub
integration. Preview URLs sit behind Vercel's Standard Protection by default (see the settings
table above) — an unauthenticated request 302s to `vercel.com/sso-api` instead of returning the
page, so a plain `curl` against a preview URL is not expected to return 200 the way production
does. No Playwright/e2e runs against preview URLs — #36 runs e2e against a local production build
only, per the epic's out-of-scope note; #58/#69 will need to account for this protection when they
target previews.

### Ignored Build Step

Turborepo exposes `turbo-ignore` for exactly this ("skip the deploy if nothing this app depends on
changed"). It was evaluated and **deliberately not configured** for this task: the project is a
single Next.js app plus two workspace packages it always depends on, so in practice almost every
change in the repo is app-relevant, and skipping builds would mostly save nothing while adding a
failure mode (a change that *should* deploy silently doesn't) before there's a second app in the
monorepo to make the skip worthwhile. Revisit when a second deployable target exists. If enabled
later, the command is `npx turbo-ignore @hire-me-mcp/web` as the project's Ignored Build Step.

### Current status

Connected and live. The Vercel project (`hire-me-mcp-web`, personal Hobby account) is linked to
`garusis/hire-me-mcp` with Production Branch `main`.

- **Production:** `main`'s latest commit is deployed; `curl -s -o /dev/null -w '%{http_code}' https://hire-me-mcp-web.vercel.app/`
  returns `200`, and the HTML includes both `Domain package: @hire-me-mcp/core` and
  `Career data package: @hire-me-mcp/career-data` (see the build-command section above).
- **Preview:** confirmed working — a follow-up PR to this repo produces its own Vercel preview
  deployment, visible via `gh api repos/garusis/hire-me-mcp/deployments` and the deployment's own
  check on the PR. Consistent with Standard Protection being on for Preview (see above), the
  preview URL 302s to `vercel.com/sso-api` for an unauthenticated request rather than returning
  200 directly — that's Vercel's default protection behavior, not a broken deployment.
- One already-open PR (#89, from before this project was connected) did not get a retroactive
  preview deployment — Vercel only builds previews for pushes made after the GitHub integration
  is live, so a PR with no new commits since connection has no preview until it receives one.
