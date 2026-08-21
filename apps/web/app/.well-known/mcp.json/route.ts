import { buildConnectionMetadata } from "../../../lib/mcp/connection-metadata";
import { getMcpEndpointUrl } from "../../../src/lib/config/site-url";

/**
 * `GET /.well-known/mcp.json` (#38).
 *
 * IMPORTANT — this is a PROJECT CONVENTION, not part of the MCP
 * specification. As of the 2025-11-25 spec revision, the MCP authorization
 * spec (`/specification/2025-11-25/basic/authorization`) defines exactly one
 * kind of `/.well-known/` document — OAuth 2.0 Protected Resource Metadata
 * (RFC 9728, e.g. `/.well-known/oauth-protected-resource`) — and it says so
 * explicitly: "Authorization is OPTIONAL for MCP implementations." Every
 * MUST in that section ("MCP servers MUST implement OAuth 2.0 Protected
 * Resource Metadata...") is scoped to servers that *support* authorization.
 * This server's connection metadata (`connection-metadata.ts`) declares
 * `auth: "none"` — it is a public, anonymous, read-only server with no
 * OAuth flow, so none of the spec's authorization-discovery documents apply
 * here. That's a deliberate absence, not an oversight — see `docs/mcp.md`
 * and the root README's "Discovery" section for the full spec-vs-convention
 * writeup.
 *
 * What this route serves instead is a small, non-normative "here is my MCP
 * server" descriptor at the `/.well-known/mcp.json` path this project
 * chose — nothing in the spec reserves or defines that path. It's rendered
 * straight from `apps/web/lib/mcp/connection-metadata.ts` (#17's single
 * source of truth for server name, endpoint, transport, auth model and tool
 * list), the same module the `/mcp` page and `/llms.txt` already read from,
 * so it can never drift from the real tool registry or the deploy's actual
 * endpoint URL.
 *
 * No `outputFileTracingIncludes` entry is needed for this route: unlike
 * `/api/mcp` (#113), it never reads `packages/career-data/content/**` via
 * `fs` — `buildConnectionMetadata` only touches the in-memory tool
 * catalogue's static `name`/`description`/`examplePrompt` strings.
 */
export async function GET(): Promise<Response> {
  const metadata = buildConnectionMetadata(getMcpEndpointUrl());
  return Response.json(metadata);
}
