# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each release below corresponds to a closed
[GitHub milestone](https://github.com/garusis/hire-me-mcp/milestones?state=closed);
the milestone link in each heading is the full traceable issue list for that release.

## Versioning policy (post-1.0)

- **Patch** (`1.0.x`) — bug fixes, career-data content updates, dependency and
  infrastructure maintenance. Nothing an already-connected agent needs to know about.
- **Minor** (`1.x.0`) — new MCP tools, new site features, or additive changes to
  existing tool responses. Existing clients keep working unchanged.
- **Major** (`x.0.0`) — breaking changes to the MCP contract: removing or renaming a
  tool, changing a tool's input schema or response envelope incompatibly, or changing
  the endpoint URL or transport.

To cut a release: certify production with the release-readiness pyramid
([`docs/release-readiness.md`](docs/release-readiness.md), `pnpm certify:production` or the
**Release Readiness** workflow), bump the workspace `package.json` versions (the MCP server
reports `apps/web/package.json`'s version in `initialize`), add a section here, then tag the
deployed commit and publish a GitHub Release.

## [1.0.0] — 2026-08-25

Milestone: [v1.0 — Launch](https://github.com/garusis/hire-me-mcp/milestone/9) ·
Epic: [#9](https://github.com/garusis/hire-me-mcp/issues/9)

The public launch. Everything that was live in v0.8 is now hardened, certified against
production, and versioned.

### Added

- Downloadable CV (PDF) generated straight from `packages/career-data` — the same source of
  truth the site and MCP server read, so the PDF can never drift from the live answers.
  Served at `/cv/marcos-javier-alvarez-cv.pdf` with a print-ready HTML view at `/cv/print`
  ([#35](https://github.com/garusis/hire-me-mcp/issues/35),
  [PR #180](https://github.com/garusis/hire-me-mcp/pull/180)).
- Enforced security headers and a Content-Security-Policy on every response, with tests that
  fail the build if a header regresses ([#42](https://github.com/garusis/hire-me-mcp/issues/42),
  [PR #181](https://github.com/garusis/hire-me-mcp/pull/181)).
- A committed security review checklist covering dependency audit, secrets hygiene, MCP input
  fuzzing and production rate-limit verification, with the audit gated in CI
  ([#57](https://github.com/garusis/hire-me-mcp/issues/57),
  [PR #189](https://github.com/garusis/hire-me-mcp/pull/189)).
- Performance budgets enforced in CI: Lighthouse scores and MCP/site latency thresholds now
  fail a pull request instead of decaying silently
  ([#62](https://github.com/garusis/hire-me-mcp/issues/62),
  [PR #182](https://github.com/garusis/hire-me-mcp/pull/182)).
- A one-command release-readiness certification (`pnpm certify:production`) that runs the full
  test pyramid — unit, protocol-level MCP, e2e, retrieval and agent evals — against the live
  production deployment, plus the committed checklist defining what "green" means
  ([#76](https://github.com/garusis/hire-me-mcp/issues/76),
  [PR #208](https://github.com/garusis/hire-me-mcp/pull/208),
  [PR #210](https://github.com/garusis/hire-me-mcp/pull/210)).
- Launch collateral: README status badges, a real recorded MCP session demo, and the
  announcement draft ([#78](https://github.com/garusis/hire-me-mcp/issues/78),
  [PR #184](https://github.com/garusis/hire-me-mcp/pull/184)).
- This changelog, the post-1.0 versioning policy above, and the `v1.0.0` tag and GitHub
  Release ([#80](https://github.com/garusis/hire-me-mcp/issues/80)).

### Changed

- Career data synced with the 2026 CV and evidence-bank corrections, and the project now
  features itself as the flagship portfolio entry on the site and through the MCP tools
  ([PR #193](https://github.com/garusis/hire-me-mcp/pull/193),
  [PR #199](https://github.com/garusis/hire-me-mcp/pull/199)).

## [0.8.0] — 2026-08-23

Milestone: [v0.8 — Analytics & Write Tools](https://github.com/garusis/hire-me-mcp/milestone/8) ·
Epic: [#8](https://github.com/garusis/hire-me-mcp/issues/8)

### Added

- An anonymized usage analytics pipeline: every MCP tool call and chat question is recorded
  as an aggregate-only event — which tool, which surface, the outcome — never raw arguments,
  IPs or identifying information ([#79](https://github.com/garusis/hire-me-mcp/issues/79)).
- Vercel Analytics on the site, a private stats view for the owner, and a public, auditable
  privacy note at `/privacy` describing exactly what is and isn't collected
  ([#81](https://github.com/garusis/hire-me-mcp/issues/81)).
- A contact-submission domain service in `packages/core` with Zod validation and spam
  heuristics, behind a fake-able delivery port
  ([#20](https://github.com/garusis/hire-me-mcp/issues/20)).

### Changed

- Public write tools (`contact`, `book_call`) were deliberately **descoped**: the public MCP
  server and chat agent ship read-only. The abuse surface of anonymous write tools outweighed
  their value for this project, so contact stays on the site itself
  ([#60](https://github.com/garusis/hire-me-mcp/issues/60),
  [#74](https://github.com/garusis/hire-me-mcp/issues/74),
  [#77](https://github.com/garusis/hire-me-mcp/issues/77) closed as not planned).

## [0.7.0] — 2026-08-21

Milestone: [v0.7 — Agent-First Onboarding](https://github.com/garusis/hire-me-mcp/milestone/7) ·
Epic: [#7](https://github.com/garusis/hire-me-mcp/issues/7)

### Added

- A single source of truth for MCP connection metadata (`packages/connect-metadata`) that
  generates every connection snippet in the README, docs and site — one registry, no stale
  copies ([#17](https://github.com/garusis/hire-me-mcp/issues/17)).
- `llms.txt` and `llms-full.txt` served from the site, so an agent handed only the deployed
  URL can orient itself without the repo ([#37](https://github.com/garusis/hire-me-mcp/issues/37)).
- Machine-readable discovery: JSON-LD `Person`, OpenGraph cards, and `/.well-known/mcp.json`
  ([#38](https://github.com/garusis/hire-me-mcp/issues/38)).
- A "Connect your agent" panel on the site with copy buttons and per-client deep links
  ([#45](https://github.com/garusis/hire-me-mcp/issues/45)).
- The README rewritten as a dual human-and-agent document with generated, verified MCP
  connection snippets, plus a visitor-facing orientation layer in `AGENTS.md`
  ([#23](https://github.com/garusis/hire-me-mcp/issues/23),
  [#25](https://github.com/garusis/hire-me-mcp/issues/25)).
- CI docs-rot guards that execute the documented MCP snippets against the live endpoint and
  check links, and a documented fresh-agent onboarding verification procedure
  ([#59](https://github.com/garusis/hire-me-mcp/issues/59),
  [#66](https://github.com/garusis/hire-me-mcp/issues/66)).

## [0.6.0] — 2026-08-23

Milestone: [v0.6 — Semantic Search (RAG)](https://github.com/garusis/hire-me-mcp/milestone/6) ·
Epic: [#6](https://github.com/garusis/hire-me-mcp/issues/6)

### Added

- Semantic search over the full career text: a Neon Postgres + pgvector store with
  migrations and a typed client, a career-data chunker with stable ids and citations, and an
  incremental embedding/ingestion command
  ([#14](https://github.com/garusis/hire-me-mcp/issues/14),
  [#21](https://github.com/garusis/hire-me-mcp/issues/21),
  [#24](https://github.com/garusis/hire-me-mcp/issues/24)).
- `searchCareer(query)` retrieval API in `packages/core` returning scored, cited chunks, and
  a new `search-career` MCP tool exposing it publicly with rate limiting
  ([#34](https://github.com/garusis/hire-me-mcp/issues/34),
  [#61](https://github.com/garusis/hire-me-mcp/issues/61)).
- A golden retrieval dataset with recall/precision eval harness, automated re-indexing and
  retrieval evals in CI on Neon test branches, and RAG-grounded answers in the chat agent
  ([#41](https://github.com/garusis/hire-me-mcp/issues/41),
  [#52](https://github.com/garusis/hire-me-mcp/issues/52),
  [#75](https://github.com/garusis/hire-me-mcp/issues/75)).

### Fixed

- Integration suites no longer assume an empty database now that production carries real
  indexed content, and the chunk citation shape was unified with the canonical career-data
  `Citation` ([#159](https://github.com/garusis/hire-me-mcp/issues/159),
  [#165](https://github.com/garusis/hire-me-mcp/issues/165),
  [#173](https://github.com/garusis/hire-me-mcp/issues/173),
  [#176](https://github.com/garusis/hire-me-mcp/issues/176)).

## [0.5.0] — 2026-08-21

Milestone: [v0.5 — Interview Chat Agent](https://github.com/garusis/hire-me-mcp/milestone/5) ·
Epic: [#5](https://github.com/garusis/hire-me-mcp/issues/5)

### Added

- An embedded interview chat agent on the site: a Mastra runtime running in-process with a
  swappable AI SDK model provider, streaming responses, and inline citations that link back
  to site sections ([#63](https://github.com/garusis/hire-me-mcp/issues/63),
  [#67](https://github.com/garusis/hire-me-mcp/issues/67),
  [#70](https://github.com/garusis/hire-me-mcp/issues/70)).
- The agent answers from the same `packages/core` domain services as the MCP server — a
  shared-source-of-truth architecture test enforces it
  ([#64](https://github.com/garusis/hire-me-mcp/issues/64)).
- A versioned system prompt encoding voice, gap discipline (admitting what's *not* in the
  career history) and the citation contract
  ([#65](https://github.com/garusis/hire-me-mcp/issues/65)).
- Guardrails: rate limiting, conversation caps and prompt-injection resistance
  ([#68](https://github.com/garusis/hire-me-mcp/issues/68)).
- A Mastra eval suite scoring groundedness, gap honesty and relevance on a budget-capped
  dataset, gating CI ([#72](https://github.com/garusis/hire-me-mcp/issues/72),
  [#73](https://github.com/garusis/hire-me-mcp/issues/73)).

## [0.4.0] — 2026-08-20

Milestone: [v0.4 — Portfolio Site](https://github.com/garusis/hire-me-mcp/milestone/4) ·
Epic: [#4](https://github.com/garusis/hire-me-mcp/issues/4)

### Added

- The public portfolio site in `apps/web`: a design system foundation (tokens, typography,
  dark/light, motion), a data-driven home page, experience timeline, project index/detail
  routes, and skills-with-evidence and writing pages — all rendered from the career domain
  layer through one enforced content path
  ([#15](https://github.com/garusis/hire-me-mcp/issues/15),
  [#16](https://github.com/garusis/hire-me-mcp/issues/16),
  [#28](https://github.com/garusis/hire-me-mcp/issues/28),
  [#29](https://github.com/garusis/hire-me-mcp/issues/29),
  [#30](https://github.com/garusis/hire-me-mcp/issues/30)).
- An "Add me to your AI" section with per-client MCP setup instructions and a live demo
  ([#43](https://github.com/garusis/hire-me-mcp/issues/43)).
- SEO metadata, OG images, sitemap, robots and JSON-LD generated from career data
  ([#44](https://github.com/garusis/hire-me-mcp/issues/44)).
- Playwright accessibility and content-correctness e2e suites plus Lighthouse gates running
  against preview deploys in CI ([#58](https://github.com/garusis/hire-me-mcp/issues/58)).

## [0.3.0] — 2026-08-20

Milestone: [v0.3 — Public MCP Server](https://github.com/garusis/hire-me-mcp/milestone/3) ·
Epic: [#3](https://github.com/garusis/hire-me-mcp/issues/3)

### Added

- The public MCP server: a Streamable HTTP endpoint at `/api/mcp` mounted in `apps/web`
  with `mcp-handler`, no auth required
  ([#11](https://github.com/garusis/hire-me-mcp/issues/11)).
- The first four career tools over the domain layer — `get-profile`, `get-experience`,
  `search-projects` and `get-skill-evidence` — through a tool adapter layer with citation
  passthrough and consistent error mapping
  ([#19](https://github.com/garusis/hire-me-mcp/issues/19),
  [#31](https://github.com/garusis/hire-me-mcp/issues/31),
  [#32](https://github.com/garusis/hire-me-mcp/issues/32)).
- Per-IP rate limiting backed by Upstash Redis
  ([#39](https://github.com/garusis/hire-me-mcp/issues/39)).
- Protocol-level integration tests with the real MCP SDK client in CI, e2e smoke tests
  against Vercel preview deploys, and connection docs for Claude, Cursor and generic clients
  ([#49](https://github.com/garusis/hire-me-mcp/issues/49),
  [#69](https://github.com/garusis/hire-me-mcp/issues/69),
  [#71](https://github.com/garusis/hire-me-mcp/issues/71)).

## [0.2.0] — 2026-08-19

Milestone: [v0.2 — Career Data Domain Layer](https://github.com/garusis/hire-me-mcp/milestone/2) ·
Epic: [#2](https://github.com/garusis/hire-me-mcp/issues/2)

### Added

- `packages/career-data`: the typed source of truth — profile, experience, education,
  writing, and skills with evidence, projects and explicit gap records, validated with Zod
  at build time ([#47](https://github.com/garusis/hire-me-mcp/issues/47),
  [#48](https://github.com/garusis/hire-me-mcp/issues/48),
  [#50](https://github.com/garusis/hire-me-mcp/issues/50)).
- A content lint enforcing evidence coverage, citation integrity and gap discipline — every
  claim must trace to evidence, every gap must be recorded, or the build fails
  ([#51](https://github.com/garusis/hire-me-mcp/issues/51)).
- `packages/core`: framework-free domain services — `getProfile`, `getExperience`,
  deterministic keyword/tag `searchProjects`, and `getSkillEvidence` with honest "not
  claimed" outcomes — all returning a citation envelope
  ([#53](https://github.com/garusis/hire-me-mcp/issues/53),
  [#54](https://github.com/garusis/hire-me-mcp/issues/54),
  [#55](https://github.com/garusis/hire-me-mcp/issues/55),
  [#56](https://github.com/garusis/hire-me-mcp/issues/56)).

## [0.1.0] — 2026-08-19

Milestone: [v0.1 — Foundation & Agentic DX](https://github.com/garusis/hire-me-mcp/milestone/1) ·
Epic: [#1](https://github.com/garusis/hire-me-mcp/issues/1)

### Added

- Turborepo monorepo with pnpm workspaces, Biome as the single linter/formatter, and Vitest
  per package with a root test pipeline
  ([#10](https://github.com/garusis/hire-me-mcp/issues/10),
  [#12](https://github.com/garusis/hire-me-mcp/issues/12),
  [#13](https://github.com/garusis/hire-me-mcp/issues/13)).
- Agentic development guardrails: test-first enforcement through Claude hooks, rules and
  `AGENTS.md`, plus lefthook pre-commit running Biome and affected tests
  ([#18](https://github.com/garusis/hire-me-mcp/issues/18),
  [#22](https://github.com/garusis/hire-me-mcp/issues/22)).
- GitHub Actions CI with branch protection on `main`, a Playwright smoke e2e wired into CI,
  and the Vercel project with production deploys and PR previews
  ([#27](https://github.com/garusis/hire-me-mcp/issues/27),
  [#36](https://github.com/garusis/hire-me-mcp/issues/36),
  [#40](https://github.com/garusis/hire-me-mcp/issues/40)).

[1.0.0]: https://github.com/garusis/hire-me-mcp/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/garusis/hire-me-mcp/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/garusis/hire-me-mcp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/garusis/hire-me-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/garusis/hire-me-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/garusis/hire-me-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/garusis/hire-me-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/garusis/hire-me-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/garusis/hire-me-mcp/releases/tag/v0.1.0
