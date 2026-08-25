# Connect your AI assistant to this CV

`hire-me-mcp` runs a public, anonymous [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server over Marcos Alvarez's real career data — profile, work history, projects, and skill
evidence. Any MCP-compatible assistant (Claude, Cursor, or another client that speaks the MCP
Streamable HTTP transport) can call it directly. There is no API key, no OAuth flow, and no
account — the entire setup is pasting one URL.

Every tool response carries **citations** back to the specific profile record, role, or project it
was drawn from, so an assistant using this server can answer "has he worked with X?" with a
grounded, sourced answer instead of a guess.

This document is the canonical connection guide. The same setup snippets (kept in sync with this
file) also render on the site's [`/mcp` page](https://hire-me-mcp-web.vercel.app/mcp), which adds
a live demo transcript.

## Endpoint

[mcp-endpoint]: https://hire-me-mcp-web.vercel.app/api/mcp

The public production endpoint, Streamable HTTP transport, no authentication required:

<!-- BEGIN GENERATED: mcp-endpoint-url -->
```
https://hire-me-mcp-web.vercel.app/api/mcp
```
<!-- END GENERATED: mcp-endpoint-url -->

That URL is defined once, right above — every snippet in this document that needs it (for
genuine copy-paste use in a client config) uses this exact string. If you ever see a different
URL for this endpoint in this doc, that's a bug: please [open an issue](https://github.com/garusis/hire-me-mcp/issues/new).

## Connect your client

### Claude (web/desktop) — custom connector

**Verified:** 2026-08-20, against Anthropic's help article
[_Get started with custom connectors using remote MCP_](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

In Claude, go to **Settings** (or **Customize**) → **Connectors** → **"+"** → **"Add custom
connector"**, paste the URL below, skip Advanced settings (no auth is required), then click
**Add**.

```
https://hire-me-mcp-web.vercel.app/api/mcp
```

> Note: Claude Desktop's *local*-server config file (`claude_desktop_config.json`) is a separate
> mechanism for stdio servers running on your machine — it isn't used for this remote HTTP
> endpoint. Use the custom connector flow above instead.

### Claude Code (CLI)

**Verified:** 2026-08-20, against the current [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

Run from a terminal with the Claude Code CLI installed:

<!-- BEGIN GENERATED: mcp-claude-code-snippet -->
```bash
claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
```
<!-- END GENERATED: mcp-claude-code-snippet -->

### Cursor

**Verified:** 2026-08-20, against [Cursor's MCP docs](https://cursor.com/docs/mcp).

Add this to `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

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

No `type` field is required for a remote HTTP/streamable-HTTP server.

### Generic MCP client

**Verified:** 2026-08-20, against the [MCP Streamable HTTP transport specification](https://modelcontextprotocol.io) —
this section describes the transport rather than one vendor's exact config keys, since "generic"
by definition isn't a single client.

Any client that supports the MCP **Streamable HTTP** transport can connect directly:

- **Transport:** Streamable HTTP
- **URL:** `https://hire-me-mcp-web.vercel.app/api/mcp`
- **Authentication:** none — no API key, token, or header required

Look for a "remote server", "Streamable HTTP", or "custom MCP server" option in your client and
give it the URL above. Several clients (Cursor included) share the same
`{ "mcpServers": { "<name>": { "url": "<url>" } } }` JSON shape shown for Cursor above — try that
first if your client reads a similar config file.

## Available tools

Every tool response includes citations back to the specific profile, role, or project record it
was drawn from — an assistant relaying an answer can (and should) point to that source rather
than asserting it from nowhere.

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
| `list-recommendations` | Returns every recommendation Marcos Alvarez has received on LinkedIn — recommender name, their title at the time of writing, the working relationship (e.g. direct manager, peer, report), the date, and the full recommendation text verbatim — as a list ordered most recent first, each entry with a citation and two verification links: the recommender's LinkedIn profile URL and the recommendations section of Marcos's LinkedIn profile (LinkedIn has no per-recommendation permalinks). Use this when a user asks for references, testimonials, or recommendations, or what managers and colleagues say about working with Marcos. Do not use it for the role-by-role work history itself (use get-experience), the single profile summary (use get-profile), or to check whether a specific skill is claimed (use get-skill-evidence). Takes no input. An empty list is a normal, successful result — it means no recommendations are authored yet, not an error. | "What do Marcos's managers and colleagues say about working with him? Show me his LinkedIn recommendations." |
<!-- END GENERATED: mcp-tool-table -->

(A seventh tool, `ping`, exists purely as a connectivity diagnostic — it returns `pong` and has no
dependency on career data.)

## Rate limits

The endpoint is rate-limited per caller IP to keep it available for everyone. The current limit,
the sliding-window algorithm, and the exact `429` response shape are documented in one place —
**[`apps/web/README.md` § "Rate limiting"](https://github.com/garusis/hire-me-mcp/blob/main/apps/web/README.md#rate-limiting)**
— and this doc links there rather than restating the numbers, so there is exactly one place they
can go stale.

In short: if your assistant makes many tool calls in a short window, you may eventually see a
rate-limit error. This is expected behavior for a public, unauthenticated endpoint, not a bug —
see Troubleshooting below.

## Troubleshooting

**Connector added, but no tools show up.**
Double-check the URL was copied in full (`https://hire-me-mcp-web.vercel.app/api/mcp`, no trailing
text) and that your client supports the MCP **Streamable HTTP** transport specifically — an older
client that only supports stdio or SSE-only servers won't be able to list tools from this
endpoint. Removing and re-adding the connector after confirming the URL usually resolves a stale
connection.

**Requests start failing after a bunch of calls (rate limit).**
This endpoint enforces a per-IP rate limit (see [Rate limits](#rate-limits) above). A `429`
response includes a `Retry-After` header and a JSON body with `error.code: "rate_limited"` — wait
for the window to reset and retry. This is expected for a public, anonymous endpoint, not a
connection problem.

**How to check the endpoint is up.**
Run a raw JSON-RPC `initialize` call against it:

<!-- BEGIN GENERATED: mcp-curl-jsonrpc-snippet -->
```bash
curl -s https://hire-me-mcp-web.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}'
```
<!-- END GENERATED: mcp-curl-jsonrpc-snippet -->

A healthy endpoint replies `HTTP 200` with a `result.serverInfo.name` of `"hire-me-mcp"`. Anything
else (connection refused, a 5xx, or no `result` field) means the endpoint itself is down — that's
a bug worth [reporting](https://github.com/garusis/hire-me-mcp/issues/new), not a client
misconfiguration.

## Discovery: machine-readable metadata

Besides this document and the `/mcp` page, the site (#38) exposes three "found without reading"
mechanisms so agents and crawlers that never read prose still resolve the essentials. Two are
plain web conventions; the third is explicitly **not** part of the MCP specification — see below
for why.

**JSON-LD `Person`** — the home page embeds one `<script type="application/ld+json">` block
declaring `@type: Person` (`name`, `jobTitle`, `description`, `url`, `sameAs`, `knowsAbout`),
generated from the career domain layer (`packages/career-data`) — never hand-typed. `sameAs` is
the profile's public contact links; `knowsAbout` is every authored skill's name.

**OpenGraph + Twitter cards** — every route sets `og:title`, `og:description`, `og:url`,
`og:type`, `og:image` (a generated 1200x630 PNG, per route) and `twitter:card`, each sourced from
that route's own title/description rather than a single site-wide default, so a pasted link to
`/experience` unfurls as "Experience", not as the home page.

**`GET /.well-known/mcp.json`** — a **project convention, not an MCP-spec-defined document**.
It's a small JSON descriptor (server name, endpoint, transport, auth model, tool list) rendered
straight from this same server's connection metadata (#17) — see
[`apps/web/app/.well-known/mcp.json/route.ts`](../apps/web/app/.well-known/mcp.json/route.ts) for
the implementation and its module doc for the full spec citation.

### Spec-defined vs project convention

The MCP specification (2025-11-25, `basic/authorization`) does define discovery documents under
`/.well-known/` — but only for **authorization**, and only conditionally:

> "Authorization is **OPTIONAL** for MCP implementations." When an MCP server *does* support it,
> it **MUST** implement OAuth 2.0 Protected Resource Metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728))
> at `/.well-known/oauth-protected-resource` (root or per-endpoint path).

This server's connection metadata declares `auth: "none"` — it is public, anonymous, and
read-only, with no OAuth flow of any kind. Every "MUST" in that spec section is scoped to a
server that *supports* authorization, so **none of it applies here**: this server correctly
serves no `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, or
`/.well-known/openid-configuration` document, because it isn't a protected resource. That's a
deliberate absence, verified against the spec at implementation time — not an oversight.

`/.well-known/mcp.json`, by contrast, lives at a path the spec neither reserves nor defines. It
exists purely so a crawler or agent that already knows to check `/.well-known/` for *something*
finds a small, honest, non-normative summary of this server — nothing more.

## See also

- [`apps/web/README.md` § "Rate limiting"](https://github.com/garusis/hire-me-mcp/blob/main/apps/web/README.md#rate-limiting) — canonical rate-limit documentation.
- The site's [`/mcp` page](https://hire-me-mcp-web.vercel.app/mcp) — the same setup content with a live demo transcript.
- [`/.well-known/mcp.json`](https://hire-me-mcp-web.vercel.app/.well-known/mcp.json) — the machine-readable descriptor described in "Discovery" above.
- Root [`README.md`](../README.md) — project overview and the "Connect your agent in one step" section.
