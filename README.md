# hire-me-mcp

`hire-me-mcp` is Marcos Alvarez's portfolio, rebuilt as a live, queryable API: a public, anonymous
[Model Context Protocol](https://modelcontextprotocol.io) (MCP) server and a Next.js site that both
read from the same real career data, so any AI assistant can be handed this CV as a tool and get
back cited, grounded answers instead of guesses — no API key, no signup, one URL to connect.

[![CI](https://github.com/garusis/hire-me-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/garusis/hire-me-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/tag/garusis/hire-me-mcp?label=release)](https://github.com/garusis/hire-me-mcp/tags)
[![Deployed on Vercel](https://img.shields.io/github/deployments/garusis/hire-me-mcp/production?label=vercel&logo=vercel)](https://hire-me-mcp-web.vercel.app)

**Live site:** <https://hire-me-mcp-web.vercel.app> · **Live MCP endpoint** (Streamable HTTP, no auth):

<!-- BEGIN GENERATED: mcp-endpoint-url -->
```
https://hire-me-mcp-web.vercel.app/api/mcp
```
<!-- END GENERATED: mcp-endpoint-url -->

<!--
  Real terminal transcript (not staged output) of an MCP client speaking the
  Streamable HTTP protocol to the LIVE production endpoint — see
  docs/assets/mcp-demo.tape and scripts/demo/mcp-session-demo.mjs to
  regenerate it. Marcos: feel free to replace this with a screen recording
  of the Claude Desktop/Code UI asking the same question if you'd rather
  show the chat experience instead of the raw protocol.
-->
![Terminal recording of a real MCP session: connecting to the live hire-me-mcp endpoint, listing its tools, then calling get-skill-evidence with "event-driven architecture" and receiving a cited, grounded answer pointing at a specific work-history entry.](docs/assets/mcp-demo.gif)

- **Live site:** <https://hire-me-mcp-web.vercel.app>
- **Downloadable CV (PDF):** generated straight from `packages/career-data` — same source, same
  domain layer, no separately maintained copy. Linked from the site header ("Download CV") and
  `/llms.txt`'s Site section; the stable download path is `/cv/<slugified-name>-cv.pdf` on the
  live site above. Regenerate it any time content changes with `pnpm generate:cv` and commit the
  result (the committed PDF ships with every deploy — Vercel's own build only builds/deploys the
  Next.js app, so PDF generation deliberately isn't wired into it). A print-ready HTML view of the
  same content is served at `/cv/print`.
- **Agent docs:** [`docs/mcp.md`](docs/mcp.md) (every client, rate limits, troubleshooting) and
  the site's own [`/llms.txt`](https://hire-me-mcp-web.vercel.app/llms.txt) entry point.
- **Security checklist:** [`docs/security-checklist.md`](docs/security-checklist.md), landed with
  the v1.0 security review ([#57](https://github.com/garusis/hire-me-mcp/issues/57)).

## Try it in 30 seconds

No API key, no OAuth, no account. Any client that speaks MCP's **Streamable HTTP** transport can
connect by pasting the URL above into a "remote server" / "custom connector" field.

**Claude Code (CLI):**

<!-- BEGIN GENERATED: mcp-claude-code-snippet -->
```bash
claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
```
<!-- END GENERATED: mcp-claude-code-snippet -->

**Cursor / VS Code** (`.cursor/mcp.json` or `.vscode/mcp.json`):

<!-- BEGIN GENERATED: mcp-cursor-vscode-snippet -->
```json
{
  "mcpServers": {
    "hire-me-mcp": {
      "url": "https://hire-me-mcp-web.vercel.app/api/mcp"
    }
  }
}
```
<!-- END GENERATED: mcp-cursor-vscode-snippet -->

Claude web/desktop's custom-connector flow, a raw `curl` health check, rate limits, and
troubleshooting all live in **[`docs/mcp.md`](docs/mcp.md)** — the canonical connection guide.
Every snippet above is generated from the same connection-metadata module that guide reads from
(`packages/connect-metadata`, via `pnpm generate:connect`), so it can never drift out of sync with
what the server actually serves.

## What you can ask it

Every tool response carries a citation back to the specific profile record, role, or project it
was drawn from — grounded answers, not guesses.

<!-- BEGIN GENERATED: mcp-example-prompts -->
- "Who is Marcos Alvarez, and is he currently open to new roles?"
- "What has Marcos worked on since 2022? Walk me through his recent roles."
- "Show me projects where Marcos used TypeScript or Kubernetes."
- "Has Marcos worked with event-driven architectures? Show me the evidence."
- "What's Marcos's experience with leading engineering teams and mentoring?"
- "What formal education and certifications does Marcos have?"
- "List every skill Marcos claims, with category and proficiency."
- "Which technologies does Marcos explicitly not claim experience with?"
- "Give me the complete list of Marcos's projects and open-source work."
- "Has Marcos published any articles or long-form writing?"
<!-- END GENERATED: mcp-example-prompts -->

<!-- BEGIN GENERATED: mcp-tool-table -->
| Tool | What it answers | Example question |
| --- | --- | --- |
| `get-profile` | Returns Marcos Alvarez's single profile record — name, headline, location, availability and a short bio — as one object, with citations backing it. Use this to answer 'who is this person' or 'what is their current availability/location' at a glance. Do not use it for role-by-role work history (use get-experience), specific project details (use search-projects), or to check whether a particular skill or technology is claimed (use get-skill-evidence). Takes no input. There is no 'no result' outcome in normal operation — this server's dataset always has exactly one profile. | "Who is Marcos Alvarez, and is he currently open to new roles?" |
| `get-experience` | Returns every entry from Marcos Alvarez's work history matching an optional structured filter — company, technology tags, a YYYY-MM date range, and current/past status — as a list ordered most recent first, each entry with a citation. Use this to answer 'what did they do at company X', 'what did they work on in year Y', or 'what are they doing now'. Called with no filter fields, it returns the full history. Do not use it for the single profile summary (use get-profile), to search project descriptions by keyword (use search-projects), or to check whether one named skill is claimed (use get-skill-evidence). A filter matching no roles returns a successful result with an empty list, not an error. | "What has Marcos worked on since 2022? Walk me through his recent roles." |
| `search-projects` | Searches Marcos Alvarez's project portfolio by keyword and/or technology tag and returns ranked matches, each with a relevance score, a matched-field explanation, and a citation. Matching is deterministic keyword/tag search against project names, summaries, bodies and tech tags — there is no semantic or embedding-based understanding of the query today. Use this when asked to find or describe specific projects, e.g. 'show me projects that used React' or 'what did they build with Kubernetes'. Do not use it for a chronological work history (use get-experience) or to check whether a skill is claimed at all, evidence or gap (use get-skill-evidence). A query matching no projects returns a successful result with an empty list, not an error; an empty or whitespace-only query behaves the same way. | "Show me projects where Marcos used TypeScript or Kubernetes." |
| `get-skill-evidence` | Looks up a single named skill or technology and reports one of three honest outcomes: 'claimed' (the skill with its supporting evidence), 'not-claimed' (an explicit, acknowledged gap with its own statement and related skills), or 'unknown' (the term matches neither). Use this when asked 'do you know X' or 'have you worked with Y' about one specific technology. Do not use it to browse the full skill list (use list-skills) or the full gap list (use list-gaps), or to search project descriptions for a keyword (use search-projects instead), and it is not a substitute for get-experience when the question is about a role or company rather than a single skill. A 'not-claimed' or 'unknown' result is a normal, successful answer, not an error — relay it honestly rather than retrying or hallucinating around it. | "Has Marcos worked with event-driven architectures? Show me the evidence." |
| `search-career` | Runs a fuzzy, semantic search over the full text of Marcos Alvarez's career content (experience, projects, skills, writing) and returns ranked excerpts, each with a relevance score and a citation, or an explicit 'no relevant content found' result when nothing clears the similarity threshold. Use this for open-ended, cross-cutting, or conceptual questions a structured lookup can't answer directly — e.g. 'has he worked with event-driven architectures', 'what's his experience with leading teams', 'anything about cost optimization'. Do not use it when the question maps onto a specific, structured lookup the deterministic tools already answer exactly: get-profile for who he is, get-experience for a role/company/date-range work history, search-projects for keyword/tag project search, and get-skill-evidence to check one specific named skill or technology — prefer those first, and fall back to this tool only when they don't fit. This tool is more expensive per call (it embeds the query) and subject to the same more expensive per call (it embeds the query) and subject to the same server-wide rate limit as every other tool here — don't call it repeatedly for the same question. | "What's Marcos's experience with leading engineering teams and mentoring?" |
| `list-education` | Returns every education record — institution, credential, and optional YYYY-MM start/end dates — as a list ordered most recent first, each entry with a citation. Use this to answer 'what is his education' or to render the education section of a CV or profile. Do not use it for work history (use get-experience), the one-line profile summary (use get-profile), or the skills inventory (use list-skills). Takes no input. A missing endDate means the credential is honestly still in progress — relay it as such, never invent a date; an empty list is a successful 'no education records authored' answer, not an error. | "What formal education and certifications does Marcos have?" |
| `list-skills` | Returns the full inventory of claimed skills — id, name, aliases, category, proficiency, and per-skill evidence citations — as a list sorted by name, optionally AND-filtered by category and/or proficiency; called with no filters it returns everything. Use this to enumerate every skill he claims, e.g. for a CV skills section or a 'what does he know' overview. Do not use it to check one specific named term — use get-skill-evidence, which also reports explicit gaps — or to enumerate what he does NOT claim (use list-gaps). A filter matching no skills returns a successful empty list, not an error. | "List every skill Marcos claims, with category and proficiency." |
| `list-gaps` | Returns the complete, authoritative list of acknowledged skill gaps — technologies explicitly NOT claimed — each with its verbatim authored statement and citations to adjacent claimed skills, plus a citation per gap. Use this to enumerate everything he openly does not claim, e.g. before ruling a role in or out or when asked 'what are his weak spots'. Do not use it to look up one specific named term (use get-skill-evidence) or to list what he DOES claim (use list-skills). These statements are honest, self-declared limitations: relay them verbatim, never soften, omit, or argue around them. Takes no input; an empty list would mean no gaps are authored and is a successful result, not an error. | "Which technologies does Marcos explicitly not claim experience with?" |
| `list-projects` | Returns every project record — name, summary, role, tech tags, links, and the full write-up body — as a complete list in a deterministic order (no relevance ranking, no scores), each with a citation, optionally pre-filtered to projects carrying at least one given tag. Use this to enumerate the whole project portfolio, e.g. for a CV or profile projects section. Do not use it to find projects relevant to a keyword or question — use search-projects, which ranks by relevance — or for role-by-role work history (use get-experience). A tags filter matching no projects returns a successful empty list, not an error. | "Give me the complete list of Marcos's projects and open-source work." |
| `list-writing` | Returns every published writing entry — title, published date, summary, optional canonical URL, and the full body — as a list ordered most recent first, each with a citation. Use this to enumerate his articles or publications, e.g. for a CV publications section. Do not use it for relevance search over writing excerpts (use search-career with sourceTypes ['writing']) or for project write-ups (use list-projects or search-projects). Takes no input. An empty list is the honest, successful 'nothing published yet' answer — the corpus currently has no entries — so relay it as such rather than treating it as a failed call. | "Has Marcos published any articles or long-form writing?" |
<!-- END GENERATED: mcp-tool-table -->

(A sixth tool, `ping`, exists purely as a connectivity diagnostic.)

## Architecture map

A pnpm + Turborepo monorepo. Node >= 22 (CI and Vercel run 24), pnpm 10 (pinned via
`packageManager`).

```
apps/
  web/                  Next.js 15 App Router app — the site, the chat widget, and the public MCP endpoint (app/api/mcp/route.ts)
packages/
  core/                 Framework-free domain layer (search, citations) — consumed by apps/web
  career-data/          Zod-typed career content (profile, experience, projects, skills) — the single source of truth
  agent/                Mastra-based interview chat agent (grounded RAG over packages/career-data) + eval suite
  connect-metadata/     Typed MCP connection metadata, per-client snippet renderers, and the generated-region injector (#17)
tooling/
  tdd-guard/             Source<->test path mapping and TDD allow/block decision logic, used by .claude/hooks
```

`apps/web` depends on the `packages/*` above via the `workspace:*` protocol — never relative
`../../packages/...` imports or `tsconfig` path hacks. `packages/core` and `packages/career-data`
stay framework-free since they also back the public MCP endpoint directly. All packages extend the
shared `tsconfig.base.json` (`strict: true`).

## Local development

Prerequisites: Node >= 22, pnpm 10 (`corepack enable` picks up the pinned version automatically).

```bash
pnpm install              # install all workspace dependencies + git hooks (lefthook)
pnpm dev                  # turbo run dev — runs all dev servers (site at http://localhost:3000)
pnpm turbo lint typecheck test build   # the canonical pipeline — same one CI and the Stop hook run
```

Required environment variables (names only — see `.env.example` for the full rationale and where
each is consulted; real values are never committed):

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Optional override for the site's own absolute origin. Not required — Vercel derives it automatically. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis credentials backing `/api/mcp` rate limiting. Unset fails open (no limiting) rather than erroring. |
| `RATELIMIT_MAX_REQUESTS`, `RATELIMIT_WINDOW_SECONDS` | Override the MCP endpoint's rate-limit window. |
| `CHAT_PROVIDER`, `CHAT_MODEL_ID` | Select and pin the chat agent's model provider/id. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Required when `CHAT_PROVIDER=google` (the default). |
| `ANTHROPIC_API_KEY` | Required only when `CHAT_PROVIDER=anthropic`. |
| `CHAT_SESSION_RATELIMIT_MAX_REQUESTS`, `CHAT_SESSION_RATELIMIT_WINDOW_SECONDS`, `CHAT_IP_RATELIMIT_MAX_REQUESTS`, `CHAT_IP_RATELIMIT_WINDOW_SECONDS`, `CHAT_AGENT_MAX_STEPS` | Chat guardrail tuning — see `apps/web/README.md` "Chat guardrails". |
| `DATABASE_URL` | Neon Postgres connection string for the `@hire-me-mcp/core/db` module (migrations, ingestion, `searchCareer`). See `packages/core/README.md`. |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | Create/delete a throwaway Neon branch for the DB integration test suite only — never used against the main database. |

None are required for `pnpm turbo lint typecheck test build` to pass on a clean checkout.

```bash
pnpm lint                 # turbo run lint — Biome, the only linter/formatter in this repo
pnpm typecheck             # turbo run typecheck — strict TypeScript everywhere
pnpm test                  # turbo run test — Vitest, co-located *.test.ts(x) next to source
pnpm build                 # turbo run build — builds all packages in dependency order
pnpm test:e2e               # Playwright smoke test against a production build
pnpm test:mcp               # protocol-level MCP integration suite (real SDK client, real server process)
pnpm eval:agent              # chat agent groundedness/gap-honesty/relevance evals
pnpm eval:retrieval          # searchCareer recall@k/precision@k/MRR golden-dataset eval
pnpm generate:connect:check  # verify the generated regions above are up to date with the real tool registry
```

Full test-pyramid mechanics (preview e2e, Lighthouse, pre-commit hooks, CI jobs, branch
protection), plus how to reproduce the Vercel deployment locally, live in
**[`docs/development.md`](docs/development.md)** and **[`docs/deployment.md`](docs/deployment.md)**
— this section only lists the commands, not the "why".

## Learn more

- **[`AGENTS.md`](AGENTS.md)** — rules for any coding agent working on this codebase: test-first
  development, the canonical commands, and the three layers that enforce both.
- **[`docs/mcp.md`](docs/mcp.md)** — the full MCP connection guide (every client, rate limits,
  troubleshooting), including its **"Discovery: machine-readable metadata"** section on JSON-LD
  `Person`, per-route OpenGraph/Twitter cards, and `/.well-known/mcp.json` — and which of those are
  MCP-spec-defined (none, for this no-auth server) versus project convention.
- **[`/llms.txt`](https://hire-me-mcp-web.vercel.app/llms.txt)** — the site's own agent entry
  point, for a visitor who was handed the deployed URL rather than this repo.
- **[`docs/security-checklist.md`](docs/security-checklist.md)** — the v1.0 security review:
  dependency/supply-chain audit, secrets hygiene, MCP input fuzzing, and production rate-limit
  re-verification, with what was checked, fixed, accepted (and why), and how to re-run each check.
- **[Issue tracker](https://github.com/garusis/hire-me-mcp/issues)** — roadmap, open work, and
  where to report a stale snippet or a bug in the MCP server.
