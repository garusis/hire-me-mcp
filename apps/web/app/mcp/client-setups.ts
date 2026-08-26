/**
 * Per-client MCP setup snippets rendered in `ClientTabs` on `/mcp` (#43).
 * `buildClientSetups(endpointUrl)` is a pure function of the one endpoint
 * URL the page computes (`src/lib/config/site-url.ts#getMcpEndpointUrl`).
 *
 * As of issue 250, this module is a *pass-through*: it builds this server's
 * `ConnectionMetadata` (`lib/mcp/connection-metadata.ts`, which derives its
 * tool list from the real registry) for the given endpoint URL, then
 * returns `@hire-me-mcp/connect-metadata`'s `buildClientSnippets` output
 * unchanged — the exact same six entries the home page's connect widget,
 * `docs/mcp.md` and the root `README.md` render (Claude web/desktop,
 * Claude Code, Claude Desktop JSON, VS Code / Cursor, raw curl, generic).
 * `/mcp` previously kept its own four-entry subset here, so the page a
 * "full setup" link pointed at offered *less* than the teaser linking to
 * it; delegating wholesale makes that divergence impossible. No snippet
 * format or client list is defined twice.
 */

import { buildClientSnippets, type ClientSnippet } from "@hire-me-mcp/connect-metadata";
import { buildConnectionMetadata } from "../../lib/mcp/connection-metadata";

export type ClientSetup = ClientSnippet;

export function buildClientSetups(endpointUrl: string): ClientSetup[] {
  return buildClientSnippets(buildConnectionMetadata(endpointUrl));
}
