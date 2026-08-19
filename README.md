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

A pnpm + Turborepo monorepo. Node >= 20, pnpm 10 (pinned via `packageManager`).

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

Pre-commit hooks, CI, and deployment are wired up in later tasks of the [Foundation & Agentic DX epic](https://github.com/garusis/hire-me-mcp/issues/1).

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

[Vitest](https://vitest.dev) is the unit/integration test runner for the whole repo. A shared base config (`vitest.config.base.ts`, root) sets the test file convention, exclusions, and coverage settings; each package's `vitest.config.ts` extends it via `mergeConfig`, adding only what differs — `environment: "node"` for `packages/*`, `environment: "happy-dom"` plus the `@vitejs/plugin-react` plugin for `apps/web` (App Router components need JSX/React support; `happy-dom` is a pure-JS DOM implementation, so no browser is ever downloaded or launched — Playwright/e2e is a separate, later task and a separate command). Coverage uses the `v8` provider; no hard threshold is enforced yet, so `test:coverage` just has to run clean and print a report.

**Test file convention — co-located `*.test.ts` / `*.test.tsx` next to the source file they exercise** (e.g. `src/index.ts` → `src/index.test.ts`, `app/page.tsx` → `app/page.test.tsx`). This is chosen over a parallel `tests/` directory because it keeps a 1:1, greppable mapping between a source file and its test with no path translation — `path/to/foo.ts` always has its test at `path/to/foo.test.ts`, which is exactly the deterministic rule later TDD tooling needs to map one to the other.

```bash
pnpm test                        # turbo run test — vitest run in every package (cacheable)
pnpm --filter web test           # test a single package
pnpm --filter web test:watch     # watch mode for a single package (not run by turbo)
pnpm test:coverage        # turbo run test:coverage — vitest run --coverage everywhere
pnpm --filter web test:coverage  # coverage for a single package
```

### Continuous integration and branch protection

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on every push to `main`. It has a single `quality` job with four separately visible steps — Biome check, typecheck, unit tests, build — so a failure is attributable at a glance. It is structured to let a future `e2e` job (Playwright, a later task) be appended without restructuring the workflow.

- Node is pinned via `.nvmrc`; pnpm is installed via `pnpm/action-setup`, which reads the version from the root `packageManager` field.
- Dependencies install with `pnpm install --frozen-lockfile`, so a stale lockfile fails CI instead of silently drifting.
- The pnpm store and the Turborepo cache (`.turbo`) are cached across runs, so an unchanged branch replays cached task output (`>>> FULL TURBO`) instead of re-running typecheck/test/build.
- `concurrency` cancels a previous in-flight run for the same ref when a new commit is pushed.
- CI is the remote mirror of the lefthook pre-commit gate (#18): anything pre-commit rejects locally must also fail here, so `--no-verify` doesn't let a violation reach `main`.

`main` is protected to match: no direct pushes, no force pushes, and the `quality` check must pass before a PR can merge. This was configured once, by hand, by PUTting a JSON body (the branch protection endpoint rejects `gh api -f/-F` key-path syntax for this nested shape, so a body file is the reliable way to reproduce it):

```bash
cat > branch-protection.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "quality" }]
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
