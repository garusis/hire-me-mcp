/**
 * Renders the `{ "mcpServers": { "<name>": { "url": "<url>" } } }` JSON
 * shape shared by several MCP clients' config files for a remote Streamable
 * HTTP server — Cursor's and VS Code's `mcp.json` (project or global), and
 * the JSON config newer Claude Desktop builds accept for a remote server
 * entry alongside their local (stdio) `command`/`args` entries. Confirmed
 * against Cursor's own docs (https://cursor.com/docs/mcp); the same
 * `mcpServers.<name>.url` key is the de facto convention several MCP
 * clients share, which is why one renderer backs more than one client
 * entry in `renderers/client-snippets.ts`.
 */

import type { ConnectionMetadata } from "../schema";

export function renderMcpServersJson(metadata: ConnectionMetadata): string {
  return JSON.stringify(
    { mcpServers: { [metadata.serverName]: { url: metadata.endpointUrl } } },
    null,
    2,
  );
}
