# Release readiness (#76)

How to certify a release: one command runs the entire test pyramid against the
production configuration and the production domain, and reports a single
pass/fail. This document is the committed checklist that defines what "green"
means at each level, the test-coverage inventory proving every shipped v0.x
surface has automated coverage, and the safety rationale for running the
pyramid against a live production deployment.

## The one command

```bash
pnpm certify:production                 # certifies https://hire-me-mcp-web.vercel.app
BASE_URL=<origin> pnpm certify:production   # certifies another deployment
```

`scripts/certify-production.mjs` runs every level below in order, prints a
per-step PASS/FAIL table and a single verdict, and exits non-zero if any level
fails. Requires `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL`, `NEON_API_KEY`
and `NEON_PROJECT_ID` (see `.env.example`) — a missing secret **fails** the run
rather than skipping a level, because a release run that silently certifies
less than the whole pyramid is worse than a red one.

In CI: the **Release Readiness** workflow
(`.github/workflows/release-readiness.yml`) is the same script provisioned
with repo secrets, dispatched manually:

```bash
gh workflow run release-readiness.yml            # certify production
gh workflow run release-readiness.yml -f base_url=<origin>
```

It is `workflow_dispatch`-only (never scheduled, never PR-triggered) because a
run spends real shared Gemini free-tier quota and drives real traffic at the
production domain, and it sits in the `gemini-free-tier` concurrency group so
it queues behind — never races — `preview-e2e`, `agent-evals` and
`retrieval-eval` (#169).

## The checklist — what "green" means at each level

| # | Step | Command (what the script runs) | Green means |
| --- | --- | --- | --- |
| 1 | `unit` | `pnpm turbo test` (DB/Neon env scrubbed) | Every package's unit suite passes hermetically — no network, no database, stubbed model calls only. |
| 2 | `db-integration` | packages/core integration suites | Vector store, ingestion cycle, `searchCareer` and analytics repository behave correctly against a real, throwaway Neon branch (created and deleted per run). |
| 3 | `e2e-smoke` | `pnpm test:e2e` | Every public page renders from a locally started **production build** with zero CSP violations and zero console errors, screenshots stable. |
| 4 | `mcp-protocol` | `pnpm test:mcp` | A real `@modelcontextprotocol/sdk` client completes initialize / tools-list / every tool's happy path and documented error path / fuzzed inputs / rate-limit and security-header contracts against a local production build. |
| 5 | `retrieval-eval` | `pnpm eval:retrieval` | Recall@k / precision@k / MRR meet the committed thresholds (`packages/core/src/eval-retrieval/thresholds.ts`) with **read-only** queries against the production database. |
| 6 | `agent-evals` | `pnpm eval:agent` | Honesty, citation-correctness and grounding scorers meet the committed thresholds (`packages/agent/src/evals/thresholds.ts`) on real, budget-capped Gemini calls with production model config. |
| 7 | `production-scripted-chat-refused` | `node scripts/ci/assert-scripted-chat-refused.mjs` | The scripted, model-free `/api/chat` path the PR gate uses (#264) is unreachable on production: the flag is refused with 400 `invalid_request`, with or without an automation secret, and no fixture content comes back. Costs zero model calls. |
| 8 | `production-e2e` | `BASE_URL=<prod> pnpm test:e2e:preview --project=chromium --project=chromium-latency` | The deployed-URL gate passes against production: navigation, content correctness against the real dataset, axe accessibility, responsive, theme, SEO artifacts, security headers, the MCP endpoint smoke suite, the stubbed-response chat guardrail specs, and the committed MCP latency budgets (`performance-budgets.json` — sampled after `latency.spec.ts` drains the per-IP rate window, so the p75 measurements never race the suite's own `/api/mcp` consumption). The `chromium-scripted-chat` project is omitted deliberately: production refuses scripted turns, which step 7 asserts instead. |
| 9 | `production-chat-live` | `BASE_URL=<prod> pnpm test:e2e:preview:live` | The real-model chat flows pass against production's own Google project: the grounded conversation streams a cited answer whose citation resolves, the gap conversation is honest, and the chat time-to-first-stream-event budget holds. Moved here by #264 — this proof belongs in a release run, not on every PR's merge path. |
| 10 | `production-lighthouse` | `BASE_URL=<prod> pnpm run lighthouse` | Every budgeted page meets the per-page category, Core Web Vitals and resource-byte budgets in `lighthouserc.json`. |

Suite mechanics (how each is wired, local commands, env) are documented in
[`docs/development.md`](development.md); this checklist deliberately doesn't
duplicate them.

The certification run that closed #76's "run it green" criterion is linked
from [issue #76](https://github.com/garusis/hire-me-mcp/issues/76) — re-run
the workflow and post the new run link there before any future release.

## Test-coverage inventory — every shipped v0.x surface

Epics #1–#8 (milestones v0.1–v0.8, all closed with zero open issues) shipped
the surfaces below. Each maps to at least one automated suite; the "certify
step" column ties it into the pyramid above.

| Surface (epic) | Covered by | Certify step |
| --- | --- | --- |
| Career data content validity + citations (#2) | `pnpm turbo validate` / `lint:content` (CI `quality` job), `packages/career-data` + `packages/core` unit tests | 1 |
| Domain services: profile, experience, projects, skills, evidence (#2) | `packages/core` unit tests | 1 |
| pgvector store + incremental ingestion pipeline (#6) | `rag-store.integration.test.ts`, `run.integration.test.ts` (real Neon branch) | 2 |
| `searchCareer` retrieval quality (#6) | `search-career.integration.test.ts`, `pnpm eval:retrieval` vs committed thresholds (required PR check) | 2, 5 |
| MCP server: protocol, all 6 tools (`ping`, `get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`, `search-career`), error paths, input fuzzing (#3, #6) | `apps/web/mcp-e2e/*` (`pnpm test:mcp`), `apps/web/e2e-preview/specs/mcp.spec.ts` (deployed URL) | 4, 7 |
| MCP rate limiting + API security headers (#3, #57) | `apps/web/lib/mcp/rate-limit/*` unit tests, `mcp-e2e/rate-limit.spec.ts`, `mcp-e2e/security-headers.spec.ts`, deployed-URL re-proof in `e2e-preview/specs/security-headers.spec.ts` | 4, 7 |
| Portfolio pages: `/`, `/experience`, `/projects`, `/projects/[slug]`, `/skills`, `/writing`, `/mcp`, `/privacy` (#4) | root `e2e` smoke suite (production build), `e2e-preview` navigation / content-correctness / project-filters / theme / responsive / axe specs (deployed URL) | 3, 7 |
| Chat agent: streaming, citations, honesty, gap handling, guardrails (#5) | `packages/agent` unit tests (stubbed model), `pnpm eval:agent` (real model), `chat-deterministic` (scripted response, #264) / `chat-guardrail-visibility` / `chat-accessibility` e2e specs, and `chat-grounded` / `chat-gap` in the live-model lane | 1, 6, 8, 9 |
| Chat API route + limits (#5) | `apps/web/app/api/chat/route.test.ts`, `lib/chat/*` unit tests | 1 |
| SEO artifacts: canonical/OG/Twitter meta, sitemap, robots, OG images, manifest (#4, #7) | `e2e-preview/specs/seo.spec.ts`, OG/manifest unit tests, `og-image-content-trace.smoke.spec.ts` | 3, 7 |
| Agent-first onboarding: `llms.txt` / `llms-full.txt`, `.well-known/mcp.json`, connect snippets (#7) | `generate:llms:check` (CI `quality`), `seo.spec.ts` mcp.json contract, `llms-content-trace` / `mcp-content-trace` / `no-js-client-snippets` smoke specs, docs-rot snippet check against the live endpoint | 1, 3, 7 |
| CV: HTML render, PDF generation, `/cv/print` route incl. CSP nonce (#35, #76) | `render-cv-html.test.ts`, `generate-cv-pdf.test.ts` (real headless Chromium), `app/cv/print/route.test.ts`, `/cv/print` in the smoke CSP walk, Lighthouse page budget | 1, 3, 8 |
| Document security headers + nonce-scoped CSP (#42, #57) | `middleware.test.ts`, `security-headers.smoke.spec.ts` (every public page, zero violations), deployed re-proof spec | 1, 3, 7 |
| Analytics pipeline + `/api/stats` + retention cron (#8) | `packages/core/src/analytics` unit tests, `analytics.integration.test.ts` (real Neon branch), stats/cron route unit tests | 1, 2 |
| Performance budgets: latency + Lighthouse (#62) | `e2e-preview/specs/latency.spec.ts`, `lighthouserc.json` gate | 7, 8 |
| Contact evaluation domain logic (#8) | `packages/core/src/contact/*` unit tests | 1 |

**Scope note — outbound contact:** epic #8's `contact` / `book_call` **write
tools were scope-cut** before v1.0: no MCP write tool is registered
(`apps/web/lib/mcp/tool-names.ts` is the single source of truth for the
toolset — all six tools are read-only), no contact API route exists
(`apps/web/app/api/` contains only `chat`, `cron`, `mcp`, `stats`) and nothing
in the codebase sends outbound email. The contact *domain logic* that did ship
(schema/normalization/spam heuristics in `packages/core/src/contact`) is fully
unit-tested. There is therefore no shipped write surface left uncovered.

## Running against production safely — no-pollution mitigations

The certification run touches the real production deployment. The mitigations,
per risk:

- **No outbound contact messages.** Structurally impossible, not just
  avoided: the production MCP server registers no write tool and the app has
  no contact/email endpoint (see the scope note above). Every tool the run
  calls is read-only.
- **No production data mutation.** The TRUNCATE-based reset helpers
  (`packages/core/src/db/reset-career-chunks.ts`) and the ingestion pipeline
  only ever run against the throwaway Neon branch the `db-integration` step
  creates and deletes; `certify-production.mjs` never invokes `pnpm ingest`,
  migrations, or any reset helper against `DATABASE_URL`. Retrieval and agent
  evals issue read-only queries.
- **Rate limits (no lockout, no weakened limiter).** The deployed-URL suite
  runs with one worker, `latency.spec.ts` runs strictly after all other specs
  (a Playwright `dependencies` edge), and per-tool sample counts are bounded
  by `performance-budgets.json` — the run stays inside the per-IP budget it
  is itself asserting. If a burst does trip the limiter, the 429 fails the
  run's own assertions loudly rather than locking anything out (limits are
  per-IP sliding windows; they self-reset).
- **Gemini free-tier quota (shared with live chat).** All model-calling steps
  run sequentially in one job inside the `gemini-free-tier` concurrency
  group; `eval:agent` is RPM-capped (`EVAL_RPM_LIMIT`) below the 15 RPM
  ceiling. One full certification spends a bounded, documented slice of the
  500 RPD budget — do not loop it.
- **Analytics pollution.** Tool-call and chat analytics are anonymized
  aggregates (see [`docs/analytics.md`](analytics.md)); a certification run
  adds a bounded, known-shaped blip (a handful of read-tool calls and two
  scripted chat conversations) on a site whose stats page reports trends, not
  billing. Accepted as-is — re-running certification is rare (pre-release
  only). If that changes, the documented alternative is subtracting runs by
  their known question fingerprints.

## No skipped or quarantined tests

Policy: the release run must contain zero skipped, quarantined or
known-flaky-and-ignored tests. Enforced structurally:

- No suite in this repo uses `.skip` / `.todo` quarantining; conditional
  execution exists only as env-gated `describe.runIf` on the integration
  suites, and the certification script supplies that env (and fails if it
  can't).
- `forbidOnly` is set in both Playwright configs, so an accidentally focused
  spec fails CI.
- The certification script's strict-env check means "green" can never mean
  "green because half the pyramid didn't run".

**Documented exception (2026-08-24):** the local `.env` copy of
`GOOGLE_GENERATIVE_AI_API_KEY` was found dead (HTTP 401) during the #76
certification, so the eval levels of that first run were certified via their
CI jobs (which hold a valid key) rather than a local invocation — the CI
`retrieval-eval` required check and the `agent-evals` workflow, both green on
2026-08-24. The key is being rotated; nothing in CI or production was
affected.
