/**
 * Aggregates every per-client setup entry for one `ConnectionMetadata` —
 * the shape both `docs/mcp.md`'s generated "Connect your client" section
 * and `apps/web/app/mcp/client-setups.ts` (the `/mcp` page's tabs) render
 * from. Each entry's `snippet` comes from one of the renderer functions in
 * this directory — nothing here re-derives a URL or JSON shape of its own.
 */

import type { ClientId, ConnectionMetadata } from "../schema";
import { renderClaudeCodeSnippet } from "./claude-code";
import { renderCurlJsonRpcSnippet } from "./curl-jsonrpc";
import { renderMcpServersJson } from "./mcp-json";

export interface ClientSnippet {
  id: ClientId;
  label: string;
  instructions: string;
  snippet: string;
}

export function buildClientSnippets(metadata: ConnectionMetadata): ClientSnippet[] {
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
      id: "claude-desktop-json",
      label: "Claude Desktop (JSON config)",
      instructions:
        "Add this entry to your Claude Desktop MCP config for a remote Streamable HTTP server " +
        "(the same `mcpServers.<name>.url` shape Cursor and VS Code use):",
      snippet: renderMcpServersJson(metadata),
    },
    {
      id: "vscode-cursor",
      label: "VS Code / Cursor",
      instructions:
        "Add this to `.cursor/mcp.json` (or `.vscode/mcp.json`), project- or user-level:",
      snippet: renderMcpServersJson(metadata),
    },
    {
      id: "curl-jsonrpc",
      label: "Raw JSON-RPC (curl)",
      instructions:
        "Any agent with a shell can verify the endpoint directly, no MCP client required:",
      snippet: renderCurlJsonRpcSnippet(metadata),
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
