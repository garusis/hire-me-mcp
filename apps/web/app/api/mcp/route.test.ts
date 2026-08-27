// @vitest-environment node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EXPECTED_TOOL_NAMES } from "../../../lib/mcp/tool-names";
import packageJson from "../../../package.json" with { type: "json" };
import { GET, POST } from "./route";

/**
 * Wraps a pair of Next.js route handlers (`GET`/`POST`) in a real, ephemeral
 * `node:http` server — the exact pattern `beforeAll` below uses for the
 * default-config route module, factored out so the
 * `MCP_TEST_RATE_LIMITER` test below can do the same against a *freshly
 * imported* route module (env vars this module reads are only evaluated
 * once, at import time — see `select-limiter.ts`).
 */
function startTestServer(handlers: {
  GET: typeof GET;
  POST: typeof POST;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const httpServer = createServer((req, res) => {
    void (async () => {
      const origin = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
      const request = await toFetchRequest(req, origin);
      const response =
        request.method === "GET" ? await handlers.GET(request) : await handlers.POST(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
      res.end(body);
    })();
  });

  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        baseUrl: `http://127.0.0.1:${port}/api/mcp`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            httpServer.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}

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

  it("instructions disclose that tool calls are recorded as anonymized usage analytics and link the privacy note (#81)", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const instructions = client.getInstructions();
    expect(instructions).toMatch(/anonymi[sz]ed/i);
    expect(instructions).toContain("/privacy");

    await client.close();
  });

  it("lists exactly the expected tool set, each with a description and a valid JSON Schema input", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }

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

  it("calls get-profile over streamable HTTP and gets a successful result carrying a profile and citations", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({ name: "get-profile", arguments: {} });

    expect(result.isError).not.toBe(true);
    const structuredContent = result.structuredContent as {
      data: { id: string };
      citations: unknown[];
    };
    expect(structuredContent.data.id).toBeTruthy();
    expect(Array.isArray(structuredContent.citations)).toBe(true);

    await client.close();
  });

  it("calls get-experience over streamable HTTP and gets a successful result carrying a list and citations", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({ name: "get-experience", arguments: {} });

    expect(result.isError).not.toBe(true);
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(Array.isArray(structuredContent.data)).toBe(true);
    expect(Array.isArray(structuredContent.citations)).toBe(true);

    await client.close();
  });

  it("calls search-projects over streamable HTTP and gets a successful result carrying a list and citations", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({
      name: "search-projects",
      arguments: { query: "typescript" },
    });

    expect(result.isError).not.toBe(true);
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(Array.isArray(structuredContent.data)).toBe(true);
    expect(Array.isArray(structuredContent.citations)).toBe(true);

    await client.close();
  });

  it("calls get-skill-evidence over streamable HTTP and gets a successful, discriminated-union result", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({
      name: "get-skill-evidence",
      arguments: { term: "typescript" },
    });

    expect(result.isError).not.toBe(true);
    const structuredContent = result.structuredContent as {
      data: { kind: string };
      citations: unknown[];
    };
    expect(["claimed", "not-claimed", "unknown"]).toContain(structuredContent.data.kind);
    expect(Array.isArray(structuredContent.citations)).toBe(true);

    await client.close();
  });

  it("rejects search-career called with a missing query over streamable HTTP as a documented validation failure, without touching the database", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({ name: "search-career", arguments: {} });

    // Per mcp-e2e/protocol.spec.ts's documented behavior: the registered
    // McpServer's own input-schema validation rejects a missing/mistyped
    // required field before this server's `defineTool` executor (and
    // therefore this project's own `{ code, message }` envelope) ever runs
    // — still a normal `isError: true` tool result, never a transport
    // failure, and critically: never a call to searchCareer/the embedder.
    expect(result.isError).toBe(true);
    const [firstBlock] = result.content as Array<{ type: string; text?: string }>;
    expect(firstBlock?.text?.length ?? 0).toBeGreaterThan(0);

    await client.close();
  });

  it("rejects search-career called with an out-of-range topK over streamable HTTP as a documented validation failure", async () => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);

    const result = await client.callTool({
      name: "search-career",
      arguments: { query: "typescript", topK: 999 },
    });

    expect(result.isError).toBe(true);
    const [firstBlock] = result.content as Array<{ type: string; text?: string }>;
    expect(firstBlock?.text?.length ?? 0).toBeGreaterThan(0);

    await client.close();
  });

  describe("search-career graceful degradation (#61): DATABASE_URL/GOOGLE_GENERATIVE_AI_API_KEY absent", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("returns the server's standard sanitized error envelope instead of crashing, and the server stays usable afterwards", async () => {
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
      vi.resetModules();
      const testRoute = await import("./route");
      const server = await startTestServer(testRoute);

      try {
        const client = new Client({ name: "test-client", version: "0.0.0" });
        const transport = new StreamableHTTPClientTransport(new URL(server.baseUrl));
        await client.connect(transport);

        // tools/list must still succeed — a missing env var must never break tool
        // registration/discovery, only the one tool that actually needs it.
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toContain("search-career");

        const result = await client.callTool({
          name: "search-career",
          arguments: { query: "event-driven architecture experience" },
        });

        expect(result.isError).toBe(true);
        // Error results carry no structuredContent on the wire (a declared
        // outputSchema describes success only — #242); the sanitized
        // { code, message } envelope is serialized in the text block.
        expect(result.structuredContent).toBeUndefined();
        const textBlock = (result.content as Array<{ type: string; text: string }>)[0];
        const payload = JSON.parse(textBlock?.text ?? "{}") as { code: string; message: string };
        expect(payload.code).toBe("internal_error");
        // Never leak the fact that a specific env var is missing, a connection
        // string, or any other implementation detail to the client.
        expect(payload.message).not.toMatch(
          /DATABASE_URL|GOOGLE_GENERATIVE_AI_API_KEY|postgres:\/\//i,
        );

        // The connection, and the server process, remain usable afterwards.
        const followUp = await client.callTool({ name: "ping", arguments: {} });
        expect(followUp.isError).not.toBe(true);

        await client.close();
      } finally {
        await server.close();
      }
    });
  });

  describe("MCP_TEST_RATE_LIMITER=1 (real 429 enforcement, no Upstash credentials)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("rejects a caller once it exceeds the configured limit, with a clean 429 rather than a crashed stream", async () => {
      vi.stubEnv("MCP_TEST_RATE_LIMITER", "1");
      // 2: the SDK's `connect()` handshake itself makes two HTTP requests
      // (the `initialize` call, then the `notifications/initialized`
      // notification) — the limit must accommodate both so the handshake
      // itself succeeds, with the very next request over budget.
      vi.stubEnv("RATELIMIT_MAX_REQUESTS", "2");
      vi.stubEnv("RATELIMIT_WINDOW_SECONDS", "60");
      vi.resetModules();
      const testRoute = await import("./route");
      const server = await startTestServer(testRoute);

      try {
        // The handshake consumes both allowed slots and must still
        // succeed normally.
        const client = new Client({ name: "test-client", version: "0.0.0" });
        const transport = new StreamableHTTPClientTransport(new URL(server.baseUrl));
        await client.connect(transport);
        await client.close();

        // The next request, over the limit, must fail with the
        // documented rate-limit shape (an HTTP 429 the raw fetch layer
        // can read) rather than a hung or truncated MCP stream.
        const response = await fetch(server.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2026-07-28",
              capabilities: {},
              clientInfo: { name: "test-client-2", version: "0.0.0" },
            },
          }),
        });

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBeTruthy();
        const body = (await response.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe("rate_limited");
        expect(body.error.message.length).toBeGreaterThan(0);

        // The server process itself must remain usable afterwards — a new
        // connection attempt gets a clean, immediate rejection describing
        // the 429 rather than hanging or crashing the transport.
        const recoveredClient = new Client({ name: "test-client-3", version: "0.0.0" });
        const recoveredTransport = new StreamableHTTPClientTransport(new URL(server.baseUrl));
        let recoveryError: unknown;
        try {
          await recoveredClient.connect(recoveredTransport);
        } catch (error) {
          recoveryError = error;
        }
        expect(recoveryError).toBeInstanceOf(Error);
        expect(String((recoveryError as Error).message)).toMatch(/rate_limited|Too many requests/);
      } finally {
        await server.close();
      }
    });

    it("rejects a search-career tools/call once the caller is over budget, with the same documented 429 shape (#61)", async () => {
      vi.stubEnv("MCP_TEST_RATE_LIMITER", "1");
      vi.stubEnv("RATELIMIT_MAX_REQUESTS", "2");
      vi.stubEnv("RATELIMIT_WINDOW_SECONDS", "60");
      vi.resetModules();
      const testRoute = await import("./route");
      const server = await startTestServer(testRoute);

      try {
        // Consume the caller's whole budget with the connect handshake.
        const client = new Client({ name: "test-client", version: "0.0.0" });
        const transport = new StreamableHTTPClientTransport(new URL(server.baseUrl));
        await client.connect(transport);
        await client.close();

        // A specific search-career tools/call, over budget, is rejected at the
        // HTTP layer before the MCP server (and therefore before the tool's own
        // handler, which would otherwise try to embed the query) ever sees it.
        const response = await fetch(server.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "search-career", arguments: { query: "typescript" } },
          }),
        });

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBeTruthy();
        const body = (await response.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe("rate_limited");
      } finally {
        await server.close();
      }
    });
  });
});
