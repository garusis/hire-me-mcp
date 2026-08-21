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

```
https://hire-me-mcp-web.vercel.app/api/mcp
```

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

```bash
claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp
```

### Cursor

**Verified:** 2026-08-20, against [Cursor's MCP docs](https://cursor.com/docs/mcp).

Add this to `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "hire-me-mcp": {
      "url": "https://hire-me-mcp-web.vercel.app/api/mcp"
    }
  }
}
```

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

| Tool | What it answers | Example question |
| --- | --- | --- |
| `get-profile` | Marcos's single profile record — name, headline, location, availability, and a short bio. | "Who is Marcos Alvarez, and is he currently open to new roles?" |
| `get-experience` | Work history, optionally filtered by company, technology, date range, or current/past status. | "What has Marcos worked on since 2022? Walk me through his recent roles." |
| `search-projects` | Ranked keyword/tag search over his project portfolio. | "Show me projects where Marcos used TypeScript or Kubernetes." |
| `get-skill-evidence` | Whether a specific named skill or technology is claimed, with supporting evidence, an honest gap, or "unknown" if it doesn't match anything tracked. | "Has Marcos worked with event-driven architectures? Show me the evidence." |

(A fifth tool, `ping`, exists purely as a connectivity diagnostic — it returns `pong` and has no
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

```bash
curl -s https://hire-me-mcp-web.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}'
```

A healthy endpoint replies `HTTP 200` with a `result.serverInfo.name` of `"hire-me-mcp"`. Anything
else (connection refused, a 5xx, or no `result` field) means the endpoint itself is down — that's
a bug worth [reporting](https://github.com/garusis/hire-me-mcp/issues/new), not a client
misconfiguration.

## See also

- [`apps/web/README.md` § "Rate limiting"](https://github.com/garusis/hire-me-mcp/blob/main/apps/web/README.md#rate-limiting) — canonical rate-limit documentation.
- The site's [`/mcp` page](https://hire-me-mcp-web.vercel.app/mcp) — the same setup content with a live demo transcript.
- Root [`README.md`](../README.md) — project overview and the "Add this CV to your AI assistant" section.
