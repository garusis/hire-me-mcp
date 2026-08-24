# Launch announcement — DRAFT

**Status: draft, not posted anywhere.** Written for #78 (launch collateral). Posting is a
separate, manual decision left to Marcos — this file exists so the copy is ready when he makes
that call, not as a signal that it has gone out.

Regenerate/update this draft whenever the canonical facts below change (endpoint URL, tool names,
version tag) rather than letting it drift from `README.md` / `docs/mcp.md`.

## Canonical facts referenced in this draft

- Live site: <https://hire-me-mcp-web.vercel.app>
- Live MCP endpoint (Streamable HTTP, no auth): <https://hire-me-mcp-web.vercel.app/api/mcp>
- Connection guide: [`docs/mcp.md`](../mcp.md)
- Repo: <https://github.com/garusis/hire-me-mcp>
- Downloadable CV: <https://hire-me-mcp-web.vercel.app/cv/marcos-javier-alvarez-cv.pdf>

## Short-form (X / LinkedIn / Bluesky, ~500 chars)

> I turned my CV into an MCP server.
>
> `hire-me-mcp` is a live, public [Model Context Protocol](https://modelcontextprotocol.io)
> endpoint over my real career data — any AI agent can connect and ask "has Marcos worked with
> event-driven architecture?" and get back a cited, grounded answer, not a guess.
>
> No API key, no signup — paste one URL:
> https://hire-me-mcp-web.vercel.app/api/mcp
>
> Code + docs: https://github.com/garusis/hire-me-mcp

## Long-form (blog post / LinkedIn article)

### Title: I built my CV as an API, not a PDF

For years my CV has been a static PDF — a snapshot that goes stale, that no tool can query, and
that says "trust me" instead of showing its work. `hire-me-mcp` is my attempt at something better:
a portfolio that's also a live API, built specifically so an AI assistant can use it as a tool.

**What it is.** A public, anonymous [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server, plus a normal Next.js site, both reading from the same typed career-data source. Any
MCP-compatible client — Claude, Cursor, VS Code, or a script — can connect to
`https://hire-me-mcp-web.vercel.app/api/mcp` with zero configuration: no API key, no OAuth, no
account.

**Why it's different from "chat with my CV" demos.** Every tool response carries a citation back
to the exact profile record, role, or project it came from. Ask "has Marcos worked with
event-driven architectures?" and the answer isn't an LLM improvising from a prompt stuffed with my
resume text — it's a structured lookup (`get-skill-evidence`) that returns one of three honest
outcomes: claimed (with evidence), explicitly not claimed (an acknowledged gap), or unknown. There
is a fuzzy semantic-search tool (`search-career`) for open-ended questions too, but even that
returns ranked excerpts with citations, or an explicit "nothing relevant found" rather than a
hallucinated answer.

**What's under the hood.**

- A pnpm/Turborepo monorepo: a framework-free domain layer (`packages/core`) shared by the Next.js
  app and the MCP server, so there's exactly one source of truth for the data and the search logic.
- Six tools: `get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`,
  `search-career`, and a `ping` health check.
- Machine-readable discovery for agents that land on the site rather than the repo: `/llms.txt`,
  `/.well-known/mcp.json`, JSON-LD `Person` markup, and OpenGraph/Twitter cards per route.
- CI that treats documentation as code: every MCP connection snippet in the README and
  `docs/mcp.md` is executed against the live deployment on every PR, and every link in the repo's
  Markdown and on the deployed site is crawled and checked — so a stale snippet or a broken link
  fails the build instead of quietly rotting.
- A downloadable, always-current CV PDF generated from the same career-data source as the API —
  one place to edit, every surface stays in sync.

**Try it in 30 seconds.** Paste the endpoint into any MCP client's "remote server" field, or run:

```bash
claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
```

Then ask it something like "What has Marcos worked on since 2022?" or "Show me projects where he
used TypeScript or Kubernetes."

**What's next.** A security checklist covering dependency audit, secrets hygiene, MCP input
fuzzing, and rate-limit re-verification is landing alongside this launch (tracked in the repo's
issue tracker); v1.0 follows shortly after.

Code, architecture notes, and the full connection guide: <https://github.com/garusis/hire-me-mcp>.

## Key talking points

- **The differentiator is grounded, cited answers** — not a chatbot UI. Every response traces back
  to a specific record; "unknown"/"not claimed" is a normal, honest outcome, never a hallucination.
- **Zero-friction connection** — no API key, no OAuth, no account. One URL, works with any MCP
  Streamable HTTP client.
- **Two audiences, one source of truth** — a human-readable site (with a downloadable CV) and an
  agent-readable API/`llms.txt` both read from the same typed career-data package, so nothing is
  maintained twice.
- **Documentation that can't silently rot** — CI executes the documented connection snippets
  against the live deployment and link-checks the whole repo and site on every PR and daily.
- **It's a real, working system**, not a mockup: live production URL, real CI, real (small) public
  attack surface with rate limiting and an in-progress security checklist.

## Links to include

- Live site: <https://hire-me-mcp-web.vercel.app>
- Live MCP endpoint: <https://hire-me-mcp-web.vercel.app/api/mcp>
- Repo / source: <https://github.com/garusis/hire-me-mcp>
- Connection guide: <https://github.com/garusis/hire-me-mcp/blob/main/docs/mcp.md>
- Downloadable CV (PDF): <https://hire-me-mcp-web.vercel.app/cv/marcos-javier-alvarez-cv.pdf>
- `/llms.txt` (agent entry point): <https://hire-me-mcp-web.vercel.app/llms.txt>

## Suggested media

- `docs/assets/mcp-demo.gif` — the same real-session recording embedded at the top of the README:
  `initialize` -> `tools/list` -> a `get-skill-evidence` call with a cited answer, captured against
  the live production endpoint via the `vhs` CLI (see `docs/assets/mcp-demo.tape` and
  `scripts/demo/mcp-session-demo.mjs` to regenerate it).
- A static screenshot of the `/mcp` page's live demo transcript, for platforms that don't render
  GIFs well (e.g. some LinkedIn post types).
- Optional follow-up: a short screen recording of an actual chat UI (Claude Desktop or Claude Code)
  asking the example questions from the README, once one is captured — the GIF above is a terminal
  transcript, not a UI walkthrough, by design (see the note in the README next to the demo).
