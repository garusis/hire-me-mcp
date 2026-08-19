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

Linting (Biome), unit tests (Vitest), pre-commit hooks, CI, and deployment are wired up in later tasks of the [Foundation & Agentic DX epic](https://github.com/garusis/hire-me-mcp/issues/1); the `lint`/`test` scripts are no-op placeholders in each package until then.
