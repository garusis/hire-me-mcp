/**
 * #59 docs-rot guard — a minimal raw JSON-RPC MCP client, used to actually
 * EXECUTE the "raw HTTP" snippet documented in docs/mcp.md's
 * `mcp-curl-jsonrpc-snippet` region against a live endpoint, plus a
 * `tools/list` call (not itself a documented snippet — the tool table and
 * `/.well-known/mcp.json` document the tool set instead).
 *
 * Deliberately not the `@modelcontextprotocol/sdk` client: this package
 * lives at the repo root (outside the pnpm workspace, same convention as
 * `scripts/ci/verify-readme-local-dev.mjs`), and re-implementing the two
 * calls the documented curl snippet actually makes is a truer "did the raw
 * HTTP snippet work" check than going through an SDK transport the docs
 * never mention. The server is confirmed stateless (no `mcp-session-id`
 * handshake needed — see `apps/web/app/api/mcp/route.ts`'s module doc), so
 * `initialize` and `tools/list` are independent requests here.
 */

/** Parses a `text/event-stream` or `application/json` MCP response body into its JSON-RPC message. */
export function parseMcpResponseBody(contentType, text) {
  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) {
      throw new Error(
        `No SSE "data:" line found in event-stream response body:\n${text.slice(0, 500)}`,
      );
    }
    return JSON.parse(dataLine.slice("data:".length).trim());
  }
  return JSON.parse(text);
}

/** Issues one raw JSON-RPC request against an MCP Streamable HTTP endpoint. */
export async function mcpRequest(url, method, params, { headers = {} } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `MCP "${method}" request to ${url} failed: HTTP ${response.status}\n${text.slice(0, 500)}`,
    );
  }
  const message = parseMcpResponseBody(response.headers.get("content-type") ?? "", text);
  if (message.error) {
    throw new Error(
      `MCP "${method}" request to ${url} returned a JSON-RPC error: ${JSON.stringify(message.error)}`,
    );
  }
  return message.result;
}

/** Runs the real MCP `initialize` handshake — what the documented curl snippet does. */
export async function mcpInitialize(url, opts) {
  return mcpRequest(
    url,
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "hire-me-mcp-docs-rot-check", version: "1.0" },
    },
    opts,
  );
}

/** Runs `tools/list` and returns just the tool names. */
export async function mcpToolsList(url, opts) {
  const result = await mcpRequest(url, "tools/list", {}, opts);
  return (result.tools ?? []).map((tool) => tool.name);
}
