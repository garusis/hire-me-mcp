/**
 * Renders the Claude Code CLI setup command — `claude mcp add --transport
 * http <name> <url>`, confirmed against the current Claude Code docs
 * (https://code.claude.com/docs/en/mcp). A pure function of `metadata`, so
 * it never drifts from the endpoint URL or server name it was built with.
 */

import type { ConnectionMetadata } from "../schema";

export function renderClaudeCodeSnippet(metadata: ConnectionMetadata): string {
  return `claude mcp add --transport http ${metadata.serverName} ${metadata.endpointUrl}`;
}
