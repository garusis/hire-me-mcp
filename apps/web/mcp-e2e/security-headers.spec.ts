/**
 * Security header suite for #42, scoped to the MCP endpoint, run against a
 * real, locally started production `next start` server — the same
 * black-box harness `protocol.spec.ts` uses (`support/next-server.ts`),
 * not the in-process route handler `app/api/mcp/route.test.ts` covers.
 *
 * This is the "MCP endpoint still passes a full initialize + tools/list +
 * tools/call sequence with headers enforced" half of the issue's
 * acceptance criteria: the middleware (#42) sits in front of every
 * request, including the real `@modelcontextprotocol/sdk` client's
 * handshake, so this proves the header set doesn't interfere with the
 * transport (chunked SSE responses, `Content-Type` negotiation, etc.)
 * headers alone can't catch.
 *
 * `apps/web/e2e/security-headers.smoke.spec.ts` covers the HTML route
 * group and the full page-walk CSP-violation check;
 * `apps/web/e2e-preview/specs/security-headers.spec.ts` re-proves both
 * against a real deployed preview.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApiSecurityHeaders,
  HSTS_HEADER_VALUE,
} from "../src/lib/security/build-security-headers";
import { type StartedServer, startNextServer } from "./support/next-server";

let server: StartedServer;

beforeAll(async () => {
  server = await startNextServer();
}, 60_000);

afterAll(async () => {
  await server.stop();
});

function connectClient(): { client: Client; transport: StreamableHTTPClientTransport } {
  const client = new Client({ name: "mcp-e2e-security-headers-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl));
  return { client, transport };
}

describe("MCP route header set", () => {
  it("carries the exact documented API header set on a raw tools/list request", async () => {
    const response = await fetch(server.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    const expectedHeaders = buildApiSecurityHeaders();
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(response.headers.get(name), `expected ${name} to be "${value}"`).toBe(value);
    }
    // No nonce, no HTML-only directives — this is the API/MCP route group,
    // never the HTML one.
    expect(response.headers.get("Content-Security-Policy")).not.toContain("nonce-");
    expect(response.headers.get("Permissions-Policy")).toBeNull();
  });

  it("also enforces the header set on an error response (an unknown method)", async () => {
    const response = await fetch(server.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "not/a/real/method", params: {} }),
    });

    expect(response.headers.get("Strict-Transport-Security")).toBe(HSTS_HEADER_VALUE);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("MCP protocol sequence with headers enforced", () => {
  it("completes initialize -> tools/list -> tools/call end to end", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBe("hire-me-mcp");

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    const result = await client.callTool({ name: "get-profile", arguments: {} });
    expect(result.isError).not.toBe(true);

    await client.close();
  });
});
