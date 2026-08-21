/**
 * Renders a raw `curl` JSON-RPC `initialize` call against the endpoint —
 * the one setup snippet that needs no MCP client at all, just an HTTP
 * client any agent already has. Mirrors the healthcheck call
 * `docs/mcp.md`'s Troubleshooting section documents.
 */

import type { ConnectionMetadata } from "../schema";

const PROTOCOL_VERSION = "2025-06-18";

export function renderCurlJsonRpcSnippet(metadata: ConnectionMetadata): string {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "healthcheck", version: "1.0" },
    },
  });

  return [
    `curl -s ${metadata.endpointUrl} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '${payload}'`,
  ].join("\n");
}
