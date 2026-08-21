/**
 * Builds and validates a `ConnectionMetadata` object (#17). This is the
 * single function every "how to connect to this MCP server" surface —
 * `apps/web/lib/mcp/connection-metadata.ts` (site + generator) — calls to
 * produce the metadata it renders from. It never invents tool names or
 * descriptions: `tools` must be supplied by the caller, derived from the
 * real MCP tool registry (see that module's doc comment for how it does so
 * in a way that breaks the build on a rename).
 */

import { type ConnectionMetadata, connectionMetadataSchema, type ToolInfo } from "./schema";

export interface BuildConnectionMetadataInput {
  serverName: string;
  description: string;
  endpointUrl: string;
  tools: ToolInfo[];
  /**
   * Defaults to each tool's own `examplePrompt`, deduplicated and capped at
   * 5 (the schema's max) — pass this explicitly only to curate a different
   * top-level set.
   */
  examplePrompts?: string[];
}

const MAX_EXAMPLE_PROMPTS = 5;

function deriveExamplePrompts(tools: ToolInfo[]): string[] {
  const unique = [...new Set(tools.map((tool) => tool.examplePrompt))];
  return unique.slice(0, MAX_EXAMPLE_PROMPTS);
}

/**
 * Validates its output against `connectionMetadataSchema` — an invalid
 * input (empty tools, a malformed endpoint URL, etc.) throws rather than
 * silently producing a metadata object a renderer would fail on later.
 */
export function buildConnectionMetadata(input: BuildConnectionMetadataInput): ConnectionMetadata {
  const candidate = {
    serverName: input.serverName,
    description: input.description,
    endpointUrl: input.endpointUrl,
    transport: "streamable-http" as const,
    auth: "none" as const,
    tools: input.tools,
    examplePrompts: input.examplePrompts ?? deriveExamplePrompts(input.tools),
  };
  return connectionMetadataSchema.parse(candidate);
}
