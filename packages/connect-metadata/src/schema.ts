/**
 * Zod schemas for the single source of truth for "how to connect to this MCP
 * server" (#17). `connectionMetadataSchema` is what `buildConnectionMetadata`
 * (`build-connection-metadata.ts`) validates its output against — every
 * consumer (renderers, the generator, apps/web) works with the validated
 * type, never a hand-typed shape of its own.
 */

import { z } from "zod";

/** Every client this module knows how to render a setup snippet for. */
export const clientIdSchema = z.enum([
  "claude-web-desktop",
  "claude-code",
  "claude-desktop-json",
  "vscode-cursor",
  "curl-jsonrpc",
  "generic",
]);
export type ClientId = z.infer<typeof clientIdSchema>;

/**
 * One MCP tool this server registers, as far as this module's consumers
 * need it: enough to render a tool table and a one-line description.
 */
export const toolInfoSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  examplePrompt: z.string().min(1),
});
export type ToolInfo = z.infer<typeof toolInfoSchema>;

/**
 * The validated connection metadata for one MCP server deployment. `tools`
 * is expected to be derived from the server's own tool registry by the
 * caller (see `apps/web/lib/mcp/connection-metadata.ts`) rather than
 * hand-typed here — this schema only validates shape, not provenance.
 */
export const connectionMetadataSchema = z.object({
  serverName: z.string().min(1),
  description: z.string().min(1),
  endpointUrl: z.url(),
  transport: z.literal("streamable-http"),
  auth: z.literal("none"),
  tools: z.array(toolInfoSchema).min(1),
  examplePrompts: z.array(z.string().min(1)).min(3).max(5),
});
export type ConnectionMetadata = z.infer<typeof connectionMetadataSchema>;
