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

## Add this CV to your AI assistant — #71

The MCP server described below is live and public. Point any MCP-compatible assistant (Claude,
Cursor, or another Streamable HTTP client) at:

<!-- BEGIN GENERATED: mcp-endpoint-url -->
```
https://hire-me-mcp-web.vercel.app/api/mcp
```
<!-- END GENERATED: mcp-endpoint-url -->

No API key, no OAuth, no account — the whole setup is that one URL. Full copy-paste instructions
per client (Claude web/desktop, Claude Code, Cursor, generic), the tool reference, rate limits,
and troubleshooting live in **[`docs/mcp.md`](docs/mcp.md)**.

## MCP endpoint — #11

`apps/web` mounts a public, anonymous MCP server at `apps/web/app/api/mcp/route.ts`, served at the
stable path `/api/mcp` (locally: `http://localhost:3000/api/mcp`) using
[`mcp-handler`](https://github.com/vercel/mcp-handler) with the Streamable HTTP transport.

- **Version pinned:** `mcp-handler@2.1.1` with its peer dependency `@modelcontextprotocol/server@2.0.0`
  and `zod@4`. This is a deliberate deviation from the older `mcp-handler` 1.x /
  `@modelcontextprotocol/sdk` pairing: `mcp-handler` 2.x (current `latest` on npm as of this task,
  verified against its published README/CHANGELOG rather than older blog posts) requires
  `@modelcontextprotocol/server` instead and dropped its `basePath`/`redisUrl`/`maxDuration`/
  `sessionIdGenerator` config options — the protocol it serves (MCP spec 2026-07-28, with a
  stateless fallback for 2025-era Streamable HTTP clients) has no sessions and no long-lived SSE
  connection to configure, so there's no equivalent option to carry over. `@modelcontextprotocol/sdk`
  (1.x) is still used, but only as a `devDependency` for the *test client* — the current SDK's
  client transport is the standard way to drive a real MCP handshake in tests, and it still speaks
  the 2025-era Streamable HTTP protocol the handler's stateless fallback answers.
- **Runtime:** `export const runtime = "nodejs"` — explicit, even though it's the Next.js App
  Router default, because `mcp-handler` needs full Node APIs. `export const maxDuration = 60` is
  the standard [Next.js/Vercel route-segment config](https://vercel.com/docs/functions/configuring-functions/duration)
  (unrelated to `mcp-handler`'s now-removed option of the same name) — 60s is the ceiling on the
  Hobby plan this project deploys to; every tool this task and its siblings register responds in
  well under a second, so this is headroom, not a requirement.
- **Server identity:** name `hire-me-mcp`, `version` read from `apps/web/package.json` at build
  time (not hand-duplicated), and a non-empty `instructions` string describing the career-Q&A
  purpose.
- **Tools:** one diagnostic tool, `ping`, so `initialize` / `tools/list` / `tools/call` are all
  exercisable before the real career-data tools (`get_profile`, `get_experience`,
  `search_projects`, `get_skill_evidence` — later tasks in #3) exist.
- **No environment variables introduced** — see `.env.example`.
- **Tests:** `apps/web/app/api/mcp/route.test.ts` drives a *real* `@modelcontextprotocol/sdk`
  client (`Client` + `StreamableHTTPClientTransport`) against a real local HTTP server whose
  request handler is the route module's own exported `GET`/`POST`, asserting the full
  `initialize` → `tools/list` → `tools/call ping` sequence over the wire — not just the route's
  internals.

### Rate limiting and troubleshooting

Rate limiting for the public MCP endpoint shipped in [#39](https://github.com/garusis/hire-me-mcp/issues/39).
The canonical documentation for the limit and the limit-exceeded response now lives in
[`apps/web/README.md` § "Rate limiting"](apps/web/README.md#rate-limiting) — this subsection is
kept as a stable anchor for older links, but the numbers themselves are only ever written down
there. For full connection instructions, the tool reference, and troubleshooting, see
[`docs/mcp.md`](docs/mcp.md) (#71).

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
bash scripts/biome-check.sh check .   # run Biome directly across the whole repo (format + lint + import sort)
```

Strict rules are enforced at `error` severity, not `warn`: no explicit or implicit `any` (`noExplicitAny`, `noImplicitAnyLet`), cognitive complexity limits (`noExcessiveCognitiveComplexity`), no unused imports/variables, and organized imports enforced as part of `biome check`. Named exports are preferred over default exports (`noDefaultExport`); the only exception is Next.js App Router files that the framework requires to use a default export (`page.tsx`, `layout.tsx`, `route.ts`, etc. under `apps/web/app/**`, plus `next.config.ts`), which are excluded via a `biome.json` override.

Every Biome invocation in this repo — `pnpm lint`/`pnpm format` in each package, the lefthook pre-commit hook, and any raw invocation — goes through `scripts/biome-check.sh`, a bounded retry wrapper (max 3 attempts) around `pnpm exec biome`. Biome 2.5.9 intermittently crashes its linter worker process with exit 254 ("Linter process terminated abnormally (possibly out of memory)"), reproducing on macOS (Apple Silicon) but never observed on CI's Linux runners ([#96](https://github.com/garusis/hire-me-mcp/issues/96)). The wrapper retries only on exit 254 — a real lint/format failure (`exit 1`) still fails on the first attempt. Prefer `bash scripts/biome-check.sh check .` (or `format`/`format --write`) over invoking `biome`/`pnpm exec biome` directly so you get the same protection.

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

### Preview gates: e2e + Lighthouse against a deployed URL (#58)

Two further gates run against an already-**deployed** URL — a Vercel preview in CI, or any arbitrary origin locally — rather than a server either of them boots itself. Both are runnable locally against any `BASE_URL`:

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

Against a Vercel Deployment-Protection-guarded preview, also set `VERCEL_AUTOMATION_BYPASS_SECRET` (the same value as the `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub Actions secret — generated once in the Vercel project's Deployment Protection settings under "Protection Bypass for Automation"): `BASE_URL=https://<preview>.vercel.app VERCEL_AUTOMATION_BYPASS_SECRET=<secret> pnpm test:e2e:preview`. Owner-approved decision (issue #58): Standard Protection stays **on** for previews — CI authenticates instead of disabling it. The bypass is applied two ways (`apps/web/e2e-preview/helpers/bypass.ts`): the `x-vercel-protection-bypass` header on every `request`-fixture/API call (`playwright.preview.config.ts`'s `extraHTTPHeaders`), and the `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true` query-param + cookie mode on every real browser navigation (the `gotoRoute` fixture) — a header alone doesn't reliably survive Vercel's own redirects for a full page load. The secret's value is never logged by either suite.

Specs live under `apps/web/e2e-preview/specs/*.spec.ts`, organized by concern (navigation, content-correctness, accessibility, responsive, theme, project-filters, seo, mcp) rather than by route — `apps/web/e2e-preview/helpers/routes.ts` is the one place every route this suite covers is listed. Content-correctness assertions (`content-correctness.spec.ts`) import `@hire-me-mcp/core` **directly** in the test process (`apps/web/e2e-preview/helpers/dataset.ts`) — never `apps/web/src/lib/content` (the `server-only`-guarded barrel every page reads through, and unimportable from a plain Node/Playwright process anyway) — so they're a genuinely independent second reader of `packages/career-data`: if a page component ever hardcodes or edits copy instead of rendering what the content layer returns, the corresponding assertion fails. This was demonstrated once, deliberately: a temporary hardcoded string was substituted for `profile.headline` in `apps/web/app/page.tsx`, `content-correctness.spec.ts`'s home-page test failed with a clear diff, and the change was reverted — see the PR description for #58 for the failing output.

The Lighthouse gate (`lighthouserc.json`, `scripts/lighthouse/`) asserts `accessibility`/`best-practices` category scores ≥ 0.95, plus every individual SEO audit (document title, meta description, canonical, crawlable anchors, link text, etc.) at a perfect score — **except** two, both deliberately excluded and both confirmed against a real Vercel preview run, not just locally:
- `is-crawlable` — every preview deploy intentionally sets `noindex` (`apps/web/src/lib/config/site-url.ts#getRobotsIndexable` — only a genuine Vercel production deploy is indexable), which `is-crawlable` correctly flags as "blocked from indexing." Asserting the aggregate `categories:seo` score would therefore always fail against a preview by design, independent of any real regression.
- `robots-txt` — Lighthouse fetches `robots.txt` via its own out-of-band request rather than through the page's browser context, so it never carries the Vercel Deployment Protection bypass header and always hits the protection interstitial (not the real `robots.txt`) on a gated preview, scoring "invalid" regardless of the site's actual content. `robots.txt` validity is instead covered by `apps/web/e2e-preview/specs/seo.spec.ts`, whose `request` fixture does carry the bypass header.

`performance` is asserted at ≥ 0.90 against previews (#58/#128 stabilization), not the 0.95 the other categories use — calibrated from a real failing run (CI run 32409684979, job 96556951552): home scored 0.88 against `/projects/<slug>` and `/mcp` both scoring 1.00 in the same run, on the very first request Lighthouse made — a cold-lambda penalty on whichever URL happens to be hit first, not a real regression. Two mitigations target that noise directly: the `lighthouse` job's "Warm up preview URLs" step sends one throwaway request per audited URL before `lhci` collects, and `lighthouserc.json`'s `numberOfRuns: 3` makes `lhci assert` compare against the median of three runs per URL instead of a single sample. The 0.90 floor is the remaining safety margin above the observed 0.88 — real regressions still fail; a full production-config Lighthouse run against a warm, non-cold-start deployment, asserting the full 0.95+ aspiration, is tracked for #62/epic 9. `scripts/lighthouse/build-config.mjs` generates the per-run `.lighthouserc.local.json` (git-ignored — it may embed the bypass header) with the three target URLs, resolving the project-detail slug from the real dataset the same way `content-correctness.spec.ts` does. `scripts/lighthouse/print-scores.mjs` prints a Markdown score table (and, in CI, appends it to the job's step summary) regardless of whether the assertion step passed.

**MCP endpoint smoke suite (`apps/web/e2e-preview/specs/mcp.spec.ts`, #69).** Drives the real `@modelcontextprotocol/sdk` client (`StreamableHTTPClientTransport`, with the bypass header applied via its own `requestInit`, since the SDK client uses its own `fetch` rather than Playwright's `request`/`page` contexts) against `${BASE_URL}/api/mcp`: a successful `initialize` handshake, `tools/list` matching `EXPECTED_TOOL_NAMES` exactly, one successful `tools/call` per career tool with citations present (structural field checks only — see the file's own docstring for why it doesn't import `@hire-me-mcp/career-data`'s `citationSchema` directly), an unregistered-tool call returning a real `McpError` over the network, and — via Playwright's `request` fixture for direct header inspection — `RateLimit-*` headers present and internally consistent on a normal request plus a **3-request bounded burst** asserting `RateLimit-Remaining` decrements sanely. That burst is deliberately tiny: the preview's real Upstash limit is the production default (60 requests/minute per caller IP), shared with the rest of this job's own traffic against the same origin, so the suite proves the header behaves correctly under load without spending a meaningful fraction of the live budget or ever driving it to an actual 429 — that path is already covered, cheaply and deterministically, by `apps/web/mcp-e2e/rate-limit.spec.ts` (#49) against its own low-limit local server. Placement is deliberate too: this spec lives alongside the other preview-gate specs and reuses `playwright.preview.config.ts` (whose `testDir` already covers it) instead of a new suite/config/CI job, so every preview-targeting check's reporting (HTML/JSON/`github` reporters, the `preview-e2e` job's artifact uploads) stays in one place on the PR. It is a SMOKE suite, not a protocol-conformance one — the schema-conformance depth (full output-schema validation per tool, every documented error-code edge case) stays in `apps/web/mcp-e2e/*.spec.ts` (#49) rather than being duplicated here; this suite exists to catch what a locally started server structurally cannot: real network/platform behaviour, environment variables, cold starts, and the REAL rate limiter with real credentials.

In CI (`.github/workflows/ci.yml`), the `preview-e2e` and `lighthouse` jobs run only on `pull_request` (a push to `main` produces a Production deploy, not a Preview one), resolve the PR's preview URL via the shared `.github/actions/resolve-vercel-preview` composite action (polls the GitHub Deployments API for the commit's `Preview`-environment deployment until a `success` status carries an `environment_url` — printed in the job log as proof the suite ran against the real deployment, not `localhost`), and skip with an explicit `::notice::`/`::warning::` message — rather than failing red — when `VERCEL_AUTOMATION_BYPASS_SECRET` is unavailable (fork PRs never receive repo secrets) or no ready preview deployment is found within the timeout. Reports are uploaded as artifacts: the Playwright HTML report/traces on failure (`playwright-preview-report/`, `test-results-preview/`), the full Lighthouse report always (`.lighthouseci/`).

**Chat flow specs (`chat-grounded.spec.ts`, `chat-gap.spec.ts`, `chat-guardrail-visibility.spec.ts`, #73 — final task of the v0.5 Interview Chat Agent epic, #5).** Live alongside the other preview-gate specs, no separate suite/config/CI job — the same reasoning as the MCP smoke suite above.

- `chat-grounded.spec.ts` and `chat-gap.spec.ts` open the chat widget (#70) and drive it through the two flows the feature is graded on: a grounded question (`apps/web/app/chat/starter-prompts.ts`'s `grounded-house-numbers` prompt) must stream an answer with a `[cite:...]` citation link whose target actually resolves (the page loads, and a fragment target's element exists in the DOM — not just that a link is present); a gap question (`gap-golang`) must produce an honest acknowledgement plus closest-evidence framing, with every experience-claim-shaped sentence outside the acknowledgement itself carrying a citation, checked with the SAME shared parser the groundedness eval scorer uses (`@hire-me-mcp/agent/citations`'s `parseCitations`), not a second ad hoc implementation. Both wait on the FINAL rendered state via Playwright's own polling (`expect(...).toBeVisible()`, `expect.poll(...)`) rather than a fixed sleep, since streamed text arrives incrementally.
- `chat-guardrail-visibility.spec.ts` stubs `POST /api/chat` (`page.route`) with the exact response bodies the real session-rate-limit and conversation-size-exceeded guardrails (#68) produce, and asserts the honest, guardrail-specific banner renders — real limits need 20-40 requests in a 5-minute window to trip for real, which would burn chat quota just to exercise UI rendering, so the issue's own scope allows stubbing this one. Building this spec surfaced a real bug, fixed in the same PR: `chat-error-messages.ts`'s `parseChatErrorText` only understood the flat `{code,message}` shape mid-stream errors use, not the nested `{error:{code,message}}` shape pre-stream 4xx guardrail responses actually use, and `KNOWN_CHAT_ERROR_CODES` was missing every one of #68's real codes — every guardrail response silently rendered a generic fallback message instead of its own honest one. Both are fixed; this spec regression-tests the fix.

**Real-model quota**: `chat-grounded.spec.ts` and `chat-gap.spec.ts` make two REAL `gemini-3.5-flash-lite` free-tier calls per `preview-e2e` run (one per spec) against the PR's deployed preview, which already carries `GOOGLE_GENERATIVE_AI_API_KEY` in its Vercel environment (no extra CI secret needed for this job — the call happens server-side inside the deployed preview, not from the test runner). Two calls per PR run is accepted as a fixed, small, predictable cost against the model's 500 requests/day free tier, shared with `agent-evals` (see `packages/agent/README.md`) and real production chat traffic — see that README's quota-rationale table for the full budget picture. All three chat specs were verified 3x consecutively with no flakes before merging (evidence in the PR description) — flakiness is a failure mode for a suite gating an honesty guarantee, not just a suite to eventually stabilize.

### Protocol-level MCP integration tests (SDK client) — added in #49

A third, separate suite drives the real `/api/mcp` endpoint with the real `@modelcontextprotocol/sdk` client over Streamable HTTP, against a **locally started production server** — black-box, never importing the route handlers directly. This is the layer above `apps/web/app/api/mcp/route.test.ts` (an in-process Vitest suite driving the same real SDK client against the route module mounted on a `node:http` server in the same process): this suite catches transport, serialization, and MCP-server schema-registration bugs that only show up when the app is actually built and running as its own process. It never asserts exact career content strings — `packages/career-data` is real, unstubbed content, so assertions are structural (shape, schema conformance, non-empty results, well-formed citations).

Own command, own config, own CI job — never runs as part of `pnpm test`/`pnpm turbo test`:

```bash
pnpm test:mcp             # builds apps/web once, then runs the suite against real next start servers
pnpm --filter web test:mcp   # same, scoped to apps/web directly
```

Layout, under `apps/web/`:

- `vitest.mcp.config.ts` — its own Vitest config (`mcp-e2e/**/*.spec.ts`, a `.spec.ts` suffix so the unit-test config's `*.test.ts` include globs never pick these up, the same convention Playwright's specs already use). `globalSetup` runs `pnpm turbo run build --filter=@hire-me-mcp/web` exactly once for the whole run — the same production build Playwright's `webServer` builds, cached by Turborepo the same way.
- `mcp-e2e/support/next-server.ts` — starts `next start` on a fresh ephemeral port (found by briefly binding to port `0`) with a given env, polls the MCP endpoint until it responds, and tears the process down afterward with a bounded `SIGTERM`→`SIGKILL` fallback so a hung process can never hang the test run.
- `mcp-e2e/protocol.spec.ts` — the default-config server: `initialize` handshake fields, `tools/list` against `EXPECTED_TOOL_NAMES` with valid input JSON Schemas, all four career tools called with realistic arguments and validated against structural output schemas (`mcp-e2e/support/tool-output-schemas.ts`, built from `@hire-me-mcp/career-data`'s real Zod schemas — see that file's docstring for why: no tool currently declares a wire-level `outputSchema` on its `ToolDefinition`), well-formed non-empty citations, and the documented error shape for an unknown tool name and for invalid arguments to a known tool.
- `mcp-e2e/rate-limit.spec.ts` — its own server process with a deliberately low `RATELIMIT_MAX_REQUESTS`/`RATELIMIT_WINDOW_SECONDS`, asserting a burst produces the documented 429 and that the server is fully usable again once the window elapses.

**Rate-limit testing without Upstash credentials.** CI never has Upstash credentials, and `createRateLimiter`'s fail-open path (`apps/web/lib/mcp/rate-limit/limiter.ts`, #39) deliberately always returns `success: true` when they're absent — by design, so the endpoint never 500s for want of Redis. That makes the real 429 path structurally unobservable through the production limiter alone. `apps/web/lib/mcp/rate-limit/select-limiter.ts` adds one env-gated hook to close that gap: setting `MCP_TEST_RATE_LIMITER=1` swaps in `test-limiter.ts`, a deterministic, in-memory, hermetic limiter that actually enforces the configured limit. It is wired into `app/api/mcp/route.ts` itself (so the black-box suite exercises the real route, not a stand-in), but is inert unless that exact env var is set — never set in production, preview, or the default-config server `protocol.spec.ts` starts. `apps/web/lib/mcp/rate-limit/select-limiter.test.ts` and `test-limiter.test.ts` cover the selection logic and the limiter's own enforcement at the unit level; `app/api/mcp/route.test.ts` has an additional in-process case proving the flag is actually wired through to the live route.

### Pre-commit hooks (lefthook)

[lefthook](https://lefthook.dev) is the **tool-agnostic** enforcement layer: a `pre-commit` hook that formats/lints staged files with Biome and runs Vitest for the packages affected by the staged changes, so a commit with a Biome violation or a broken test never reaches CI in the first place. It binds every contributor and every agent (Claude Code, Codex, or a human at the keyboard) equally, regardless of whether any editor- or agent-level hook is honoured — see `lefthook.yml` at the repo root for the full job config.

Installation is automatic: `pnpm install` runs `lefthook install --force` via the root `prepare` script, so a fresh clone is protected after one install with no manual step. (`--force` makes install succeed even if your machine has a global `core.hooksPath` override — lefthook installs into whatever path git actually reads hooks from, not blindly into `.git/hooks`.)

Pre-commit runs two jobs in parallel:

- **`biome`** — `biome check --write --staged` (via `scripts/lefthook/biome-staged.sh`, which delegates to the shared `scripts/biome-check.sh` bounded-retry wrapper for an intermittent Biome 2.5.9 daemon crash — see [#96](https://github.com/garusis/hire-me-mcp/issues/96) and "Linting and formatting (Biome)" above) over staged files only. Fixes it applies are automatically re-staged (`stage_fixed: true`), so the commit contains the formatted result, not the pre-fix version.
- **`tests`** — `pnpm turbo run test --filter="[HEAD]"`, scoped to only the packages that themselves have staged/uncommitted changes (not their dependents). A `packages/core`-only commit never runs `apps/web`'s test suite, even though `apps/web` depends on `@hire-me-mcp/core`.

Only `pre-commit` is defined — no `commit-msg` (no commit-message linter exists yet to make one worthwhile) and no `pre-push` (it would either duplicate what `pre-commit` already checked or run the full/E2E suite, which belongs to CI). Playwright/E2E never runs on pre-commit, on any hook — that's CI-only, a separate task in the epic.

**Emergency bypass** — CI re-checks everything, so this is safe to use when you need to get a commit out and fix follow-up locally, but it is not a substitute for fixing the underlying failure:

```bash
git commit --no-verify -m "..."   # skip hooks for this commit only
LEFTHOOK=0 git commit -m "..."    # same effect, explicit env var
```

`pnpm validate:lefthook` (`scripts/lefthook/validate-config.mjs`) asserts `lefthook.yml` parses and defines the `biome` and `tests` pre-commit jobs with the expected shape (`stage_fixed: true`, turbo-filtered, Playwright-free) — a plain package script any CI pipeline can call directly.

### Continuous integration and branch protection

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on every push to `main`, with five jobs:

- **`quality`** — four separately visible steps (Biome check, typecheck, unit tests, build) so a failure is attributable at a glance.
- **`e2e`** (added in #36) — runs in parallel with `quality` (no `needs:`, so a broken page is always reported as an `e2e` failure rather than skipped because `quality` also failed), installs Chromium (`pnpm exec playwright install --with-deps chromium`, browser binaries cached by Playwright version), runs `pnpm test:e2e` (the Playwright smoke spec against a production build), and on failure uploads two artifacts: the Playwright HTML report (`playwright-report/`) and the trace/screenshot output (`test-results/`), both 7-day retention. `timeout-minutes: 15` fails the job fast instead of hanging if the production server never becomes ready. A broken home page fails this job and therefore fails the required check on the PR.
- **`mcp-integration`** (added in #49) — also runs in parallel with `quality`, for the same reason. A single step, `pnpm test:mcp` (the protocol-level MCP integration suite — see "Protocol-level MCP integration tests" above), which builds `apps/web` itself via its own `globalSetup`, so this job installs dependencies only, no separate build step. `timeout-minutes: 10` bounds it; the suite itself finishes in well under a minute once dependencies are cached.
- **`preview-e2e`** and **`lighthouse`** (added in #58, `pull_request` only) — the real product e2e suite and the Lighthouse gate, both run against the PR's actual Vercel preview deployment rather than a server CI boots itself. See "Preview gates: e2e + Lighthouse against a deployed URL (#58)" above for the full mechanism (preview-URL resolution, the Deployment Protection bypass, the fork-PR skip behaviour, and the Lighthouse SEO-assertion caveat). Both are required checks alongside `quality`, `e2e` and `mcp-integration`.

A SIXTH, separate workflow, [`.github/workflows/agent-evals.yml`](.github/workflows/agent-evals.yml) (**`agent-evals`**, added in #73), gates the interview agent's honesty guarantees on real, budget-capped model output — `pnpm eval:agent` against `getInterviewAgent()`, failing the build when a scorer aggregate (groundedness/gap honesty/relevance) drops below its committed threshold (`packages/agent/src/evals/thresholds.ts`). See `packages/agent/README.md`'s "Running evals in CI" section for the full trigger/budget/no-secrets rationale; the short version:

- It is its OWN workflow file, not a `ci.yml` job — GitHub Actions `paths:` filters apply workflow-wide, and this job needs a path filter `ci.yml`'s other jobs must not share.
- Triggers are path-filtered (`packages/agent/**`, `packages/core/**`, `packages/career-data/content/**`, the chat route) plus `workflow_dispatch`, NOT every PR — the eval model (`gemini-3.5-flash-lite` free tier, 15 RPM/500 RPD) shares real, limited quota with production chat traffic and the chat e2e specs above; running a ~17-case suite (~110K tokens per a real full-dataset run) on a PR that can't have changed agent behavior would spend that shared quota for no signal.
- **Deliberately NOT added to the `required_status_checks` list below.** A path-filtered job never runs at all on a PR outside its paths, and GitHub reports a required check that never ran as pending/blocking — not "skipped, so pass." Making `agent-evals` required would block every PR that doesn't touch these paths (docs, unrelated `apps/web` UI changes, workflow config, ...) on a check that will never fire, and GitHub has no native "required-if-triggered" status for a path-filtered job. The gate is still REAL on the paths that matter (a threshold breach fails this job red, visibly, on any PR it does run on) — just enforced by the job actually running and turning red, not by branch protection's required-check mechanism.
- Skips (rather than fails) with an explicit `::notice::` when `GOOGLE_GENERATIVE_AI_API_KEY` is unavailable (fork PRs never receive repo secrets) — same pattern as `preview-e2e`/`lighthouse`'s `VERCEL_AUTOMATION_BYPASS_SECRET` check above.
- Uploads the machine-readable report (`eval-report.json`) as a build artifact and renders per-scorer aggregates, the pass/fail verdict, and token/cost totals to the job summary via `scripts/ci/eval-summary.mjs` (same `if: always()` + step-summary pattern as `lighthouse`'s `print-scores.mjs`), so a regression is readable without downloading anything.

- Node is pinned via `.nvmrc`; pnpm is installed via `pnpm/action-setup`, which reads the version from the root `packageManager` field.
- Dependencies install with `pnpm install --frozen-lockfile`, so a stale lockfile fails CI instead of silently drifting.
- The pnpm store and the Turborepo cache (`.turbo`) are cached across runs, so an unchanged branch replays cached task output (`>>> FULL TURBO`) instead of re-running typecheck/test/build.
- `concurrency` cancels a previous in-flight run for the same ref when a new commit is pushed.
- CI is the remote mirror of the lefthook pre-commit gate (#18): anything pre-commit rejects locally must also fail here, so `--no-verify` doesn't let a violation reach `main`.

`main` is protected to match: no direct pushes, no force pushes, and `quality`, `e2e`, `mcp-integration`, `preview-e2e` and `lighthouse` must all pass before a PR can merge (#58 — "a regression in content fidelity, accessibility or performance fails the PR"). This was configured once, by hand, by PUTting a JSON body (the branch protection endpoint rejects `gh api -f/-F` key-path syntax for this nested shape, so a body file is the reliable way to reproduce it):

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
