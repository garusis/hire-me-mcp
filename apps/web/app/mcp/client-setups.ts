/**
 * Per-client MCP setup snippets rendered in `ClientTabs` on `/mcp` (#43).
 * `buildClientSetups(endpointUrl)` is a pure function of the one endpoint
 * URL the page computes (`src/lib/config/site-url.ts#getMcpEndpointUrl`) —
 * every snippet interpolates that same string, so there is exactly one
 * place the URL is ever written down, not four.
 *
 * As of #17, this module is a thin adapter: it builds this server's
 * `ConnectionMetadata` (`lib/mcp/connection-metadata.ts`, which derives its
 * tool list from the real registry) for the given endpoint URL, then reads
 * each snippet straight off `@hire-me-mcp/connect-metadata`'s shared
 * renderers — the same functions `docs/mcp.md`'s and the root `README.md`'s
 * generated regions render from (`scripts/generate-connect-cli.ts`). No
 * snippet format is defined twice.
 *
 * Formats verified 2026-08-20 (this server needs no auth, so every snippet
 * below omits headers/OAuth):
 * - Claude web/desktop custom connector — Settings/Customize → Connectors →
 *   "+" → "Add custom connector" → paste the URL → Add. Confirmed against
 *   Anthropic's own help article,
 *   https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp.
 *   Claude Desktop's *local*-server config file (`claude_desktop_config.json`)
 *   is a separate mechanism for stdio servers, not used for a remote HTTP
 *   endpoint like this one.
 * - Claude Code CLI — `claude mcp add --transport http <name> <url>`,
 *   confirmed against the current Claude Code docs,
 *   https://code.claude.com/docs/en/mcp.
 * - Cursor — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global),
 *   `{ "mcpServers": { "<name>": { "url": "<url>" } } }`; no `type` field
 *   is required for a remote HTTP/streamable-HTTP server, confirmed against
 *   Cursor's own docs, https://cursor.com/docs/mcp.
 * - Generic MCP client — the same shape as Cursor's, since it's the de
 *   facto convention several MCP clients share for a remote Streamable HTTP
 *   server; framed here as "look for a Streamable HTTP / remote server
 *   option" rather than a single vendor's exact keys, since "generic" by
 *   definition isn't one specific client.
 */

import { renderClaudeCodeSnippet, renderMcpServersJson } from "@hire-me-mcp/connect-metadata";
import { buildConnectionMetadata } from "../../lib/mcp/connection-metadata";

export interface ClientSetup {
  id: "claude-web-desktop" | "claude-code" | "cursor" | "generic";
  label: string;
  instructions: string;
  snippet: string;
}

export function buildClientSetups(endpointUrl: string): ClientSetup[] {
  const metadata = buildConnectionMetadata(endpointUrl);

  return [
    {
      id: "claude-web-desktop",
      label: "Claude (web/desktop)",
      instructions:
        'In Claude, go to Settings (or Customize) → Connectors → "+" → "Add custom connector", ' +
        "paste the URL below, skip Advanced settings (no auth is required), then click Add.",
      snippet: metadata.endpointUrl,
    },
    {
      id: "claude-code",
      label: "Claude Code",
      instructions: "Run this from a terminal with the Claude Code CLI installed:",
      snippet: renderClaudeCodeSnippet(metadata),
    },
    {
      id: "cursor",
      label: "Cursor",
      instructions: "Add this to .cursor/mcp.json (project) or ~/.cursor/mcp.json (global):",
      snippet: renderMcpServersJson(metadata),
    },
    {
      id: "generic",
      label: "Generic MCP client",
      instructions:
        "Any client that supports the MCP Streamable HTTP transport can connect directly — " +
        'look for a "remote server" or "Streamable HTTP" option and give it this URL. No ' +
        "authentication, API key, or header is required.",
      snippet: metadata.endpointUrl,
    },
  ];
}
