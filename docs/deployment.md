# Deployment (Vercel)

`apps/web` is one Vercel project for the whole monorepo — there is no separate API/service
deployment. The BFF, the public MCP endpoint (`mcp-handler`), and the embedded Mastra chat agent
all ship inside this same Next.js app.

**Live URL:** <https://hire-me-mcp-web.vercel.app> — production, deployed from `main`.

## Project settings (reproduce by hand in the Vercel dashboard)

Most of these are dashboard/Project Settings, not `vercel.json` — a monorepo root directory,
install command, and build command are all expressible through Project Settings. One exception:
**`apps/web/vercel.json` is committed**, containing only a `crons` entry — scheduled cron jobs are
a `vercel.json`-only feature with no Project Settings equivalent, needed for the anonymized
usage-analytics retention sweep (#79, `docs/analytics.md`). It schedules
`GET /api/cron/analytics-retention` (`app/api/cron/analytics-retention/route.ts`) once daily; the
route authenticates the request via `Authorization: Bearer $CRON_SECRET`, which Vercel signs cron
invocations with automatically — set `CRON_SECRET` in Project Settings → Environment Variables for
Preview and Production (see `.env.example`). If another requirement genuinely can't be expressed
through Project Settings either (custom headers, rewrites), extend this same file and document why
here.

The private stats view (#81, `app/api/stats/route.ts`) needs its own secret, `STATS_SECRET`, also
set in Project Settings → Environment Variables for Preview and Production — see `.env.example` and
`docs/analytics.md` for the gate mechanism (a `?token=` query param, checked fail-closed: unset or
wrong both return 404, never 401, so nothing about the route leaks).

| Setting | Value |
| --- | --- |
| Vercel project | `hire-me-mcp-web`, personal Hobby account `marcos-javier-alvarez-maestres-projects` (**not** the House Numbers team — see note below) |
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Install Command | default (Vercel detects `pnpm-workspace.yaml` + the root `packageManager` field via corepack and runs `pnpm install --frozen-lockfile` at the workspace root) |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@hire-me-mcp/web` (override — the default per-package `next build` would skip `packages/core` and `packages/career-data`; this is the same command CI and a clean local clone use, so the Vercel build is guaranteed to be the workspace build, not an isolated `next build`) |
| Output Directory | default (`apps/web/.next`, auto-detected for Next.js under Root Directory) |
| Node.js Version | project currently on Node 20 or older — Vercel is warning that builds on this version stop being supported after **2026-09-30**; the project's Node.js Version setting should be bumped to 22 or 24 before then (owner/dashboard action; tracked for #33/#57) |
| Git repository | `garusis/hire-me-mcp`, Production Branch `main` |
| Deployment Protection | **Standard Protection is on for Preview deployments** (Vercel's default) — a preview URL redirects (302) to `vercel.com/sso-api` for anyone not authenticated to the Vercel project instead of returning the page directly. Production is not protected. |
| Ignored Build Step | not configured — evaluated and deferred, see below |

Because the project lives under the owner's **personal Vercel account**, not the House Numbers
team, the Vercel MCP tooling used elsewhere in this repo's tasks cannot see or manage it (it's
scoped to House Numbers). Day-to-day Vercel operations for this project (settings changes, env
vars, protection toggles) go through the Vercel dashboard or CLI as the owner, not through MCP/API
automation.

Verify locally that the exact same command reproduces what Vercel builds, from a clean clone:

```bash
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@hire-me-mcp/web
```

The build log (local or on Vercel) must show `@hire-me-mcp/core` and `@hire-me-mcp/career-data`
building before `@hire-me-mcp/web` — that's the check that the deploy is going through Turborepo's
dependency graph rather than a bare `next build` in isolation. Automation has no dashboard/log
access to this personal-account project, so this was verified indirectly instead: the deployed
production page renders values that only exist if `@hire-me-mcp/core` and `@hire-me-mcp/career-data`
were actually built and bundled in —

```bash
curl -s https://hire-me-mcp-web.vercel.app/ | grep -o 'Domain package:.*package'
```

## Environment variables

Real values are never committed. The convention:

- **Local development** — an untracked `apps/web/.env.local` (git-ignored; see `.gitignore`).
- **Preview / Production** — Vercel Project Settings → Environment Variables, scoped per
  environment. `.env.example` at the repo root only ever holds commented placeholders (`NAME=`)
  for variables that exist, with the full rationale for each.

See `.env.example` for the current variable list and `apps/web/README.md`'s "Rate limiting" and
"Chat guardrails" sections plus `packages/agent/README.md` for what each one controls.

## CI vs. Vercel — two independent gates

- **GitHub Actions CI** (`.github/workflows/ci.yml`, the `quality` check) is the correctness gate:
  Biome, typecheck, unit tests, build. It runs on every PR and on `main`, and branch protection
  requires it to pass before merge. CI never deploys anything.
- **Vercel** is the deploy path only: it builds and deploys every push, independent of CI. A
  Vercel build failure shows up as a failed/red check on the PR (via the Vercel GitHub integration)
  but is a separate check from `quality` — it does not block the `quality` check from passing or
  running, and branch protection is not configured to require the Vercel check. The two systems
  intentionally cannot block each other.

## Preview deployments

Every pull request against `garusis/hire-me-mcp` gets an automatic Vercel preview deployment on
its own `*.vercel.app` URL, posted as a deployment/check on the PR by the Vercel GitHub
integration. Preview URLs sit behind Vercel's Standard Protection by default (see the settings
table above) — an unauthenticated request 302s to `vercel.com/sso-api` instead of returning the
page, so a plain `curl` against a preview URL is not expected to return 200 the way production
does. See `docs/development.md`'s "Preview gates" section for how CI authenticates against this.

## Ignored Build Step

Turborepo exposes `turbo-ignore` for exactly this ("skip the deploy if nothing this app depends on
changed"). It was evaluated and **deliberately not configured**: the project is a single Next.js
app plus two workspace packages it always depends on, so in practice almost every change in the
repo is app-relevant, and skipping builds would mostly save nothing while adding a failure mode
before there's a second app in the monorepo to make the skip worthwhile. If enabled later, the
command is `npx turbo-ignore @hire-me-mcp/web` as the project's Ignored Build Step.

## Current status

Connected and live. The Vercel project (`hire-me-mcp-web`, personal Hobby account) is linked to
`garusis/hire-me-mcp` with Production Branch `main`.

- **Production:** `main`'s latest commit is deployed; `curl -s -o /dev/null -w '%{http_code}'
  https://hire-me-mcp-web.vercel.app/` returns `200`.
- **Preview:** confirmed working — a pull request produces its own Vercel preview deployment,
  visible via `gh api repos/garusis/hire-me-mcp/deployments` and the deployment's own check on the
  PR. Consistent with Standard Protection being on for Preview, the preview URL 302s to
  `vercel.com/sso-api` for an unauthenticated request rather than returning 200 directly — that's
  Vercel's default protection behavior, not a broken deployment.
