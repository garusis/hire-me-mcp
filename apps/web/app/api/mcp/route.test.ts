// @vitest-environment node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import packageJson from "../../../package.json" with { type: "json" };
import { GET, POST } from "./route";

/**
 * Real MCP client (from @modelcontextprotocol/sdk) driven over a real
 * in-process HTTP server whose request handler is the exact route module
 * (`GET`/`POST`) mounted at `apps/web/app/api/mcp/route.ts`. This exercises
 * the actual Streamable HTTP wire protocol — headers, JSON-RPC envelopes,
 * `initialize`, `tools/list`, `tools/call` — rather than asserting against
 * the route's internals, at the cost of spinning up a real socket for the
 * duration of the test file.
 */

async function toFetchRequest(req: import("node:http").IncomingMessage, origin: string) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return new Request(new URL(req.url ?? "/", origin), {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
}

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const request = await toFetchRequest(req, origin);
      const response = request.method === "GET" ? await GET(request) : await POST(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
      res.end(body);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}/api/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("MCP endpoint (app/api/mcp/route.ts)", () => {
  it("completes initialize with server name, version and non-empty instructions", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBeTruthy();
    expect(serverVersion?.version).toBe(packageJson.version);

    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    expect(instructions?.length).toBeGreaterThan(0);

    await client.close();
  });

  it("lists exactly one tool, ping, with a description and a valid JSON Schema input", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("ping");
    expect(tools[0]?.description).toBeTruthy();
    expect(tools[0]?.inputSchema).toMatchObject({ type: "object" });

    await client.close();
  });

  it("calls the ping tool and gets a successful, non-error result", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({ name: "ping", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(Array.isArray(result.content)).toBe(true);

    await client.close();
  });
});
