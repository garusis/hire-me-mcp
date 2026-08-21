/**
 * Single source of truth for "how to connect to this MCP server" (#17):
 * a typed, Zod-validated connection metadata model, per-client snippet
 * renderers, and the marked-region injector generated docs use to stay in
 * sync with it. This package is framework-free — consumed by `apps/web`
 * (the `/mcp` page and its own `connection-metadata.ts`, which derives
 * `tools` from the real MCP tool registry) and by the root `generate:connect`
 * script, which writes rendered snippets into README.md and docs/mcp.md.
 */

export {
  type BuildConnectionMetadataInput,
  buildConnectionMetadata,
} from "./build-connection-metadata.js";
export {
  checkGeneratedRegions,
  type GeneratedRegion,
  injectGeneratedRegions,
  MalformedMarkerError,
  MarkerNotFoundError,
} from "./injector.js";
export { renderClaudeCodeSnippet } from "./renderers/claude-code.js";
export {
  buildClientSnippets,
  type ClientSnippet,
} from "./renderers/client-snippets.js";
export { renderCurlJsonRpcSnippet } from "./renderers/curl-jsonrpc.js";
export { renderMcpServersJson } from "./renderers/mcp-json.js";
export {
  type ClientId,
  type ConnectionMetadata,
  clientIdSchema,
  connectionMetadataSchema,
  type ToolInfo,
  toolInfoSchema,
} from "./schema.js";
