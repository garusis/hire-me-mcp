/**
 * The single source of truth for "how to connect to this MCP server" (#17),
 * at the app layer: binds `@hire-me-mcp/connect-metadata`'s validated
 * `ConnectionMetadata` shape to *this* server's real identity and tool
 * registry, so nothing downstream (the `/mcp` page, the root
 * `generate:connect` script that writes `docs/mcp.md` and `README.md`) ever
 * re-types a tool name or description.
 *
 * `tools` comes straight from `MCP_TOOL_CATALOGUE` (`tool-catalogue.ts`),
 * which is itself read off the real `ToolDefinition` objects registered in
 * `app/api/mcp/route.ts` — never hand-duplicated. Renaming or removing a
 * registered tool without updating its example prompt breaks
 * `tool-catalogue.ts` at import time; renaming one *without* breaking that
 * still fails `connection-metadata.test.ts`'s binding assertion against
 * `EXPECTED_TOOL_NAMES`.
 */

import {
  buildConnectionMetadata as build,
  type ConnectionMetadata,
} from "@hire-me-mcp/connect-metadata";
import { MCP_TOOL_CATALOGUE } from "./tool-catalogue";

/** Server identity, matching `app/api/mcp/route.ts`'s registered `name`. */
export const SERVER_NAME = "hire-me-mcp";

export const SERVER_DESCRIPTION =
  "A public, anonymous Model Context Protocol server over Marcos Alvarez's real career data — " +
  "profile, work history, projects, skill evidence, and behavioral career stories, the last " +
  "returned only on explicit request (list-career-stories or search-career), never rendered on " +
  "a public page — with every tool response citing the specific record it was drawn from.";

/**
 * Builds this server's `ConnectionMetadata` for a given endpoint URL — the
 * fixed production URL for doc generation
 * (`src/lib/config/site-url.ts#PRODUCTION_MCP_ENDPOINT_URL`), or the
 * per-deploy runtime URL (`getMcpEndpointUrl()`) for the `/mcp` page.
 */
export function buildConnectionMetadata(endpointUrl: string): ConnectionMetadata {
  return build({
    serverName: SERVER_NAME,
    description: SERVER_DESCRIPTION,
    endpointUrl,
    tools: MCP_TOOL_CATALOGUE,
  });
}
