/**
 * Rate-limit path of the protocol-level MCP integration suite (#49):
 * asserts the documented 429 limit-exceeded behaviour against a REAL
 * locally started server, black-box over Streamable HTTP — no Upstash
 * credentials, as CI never has any (#39).
 *
 * Why this needs its own server process, and its own env-gated hook:
 * `createRateLimiter` (`lib/mcp/rate-limit/limiter.ts`) fails OPEN whenever
 * Upstash credentials are absent — it always returns `success: true`,
 * regardless of the configured limit, by explicit product decision (the
 * endpoint must never 500 for want of Redis). That means the real 429 path
 * is structurally unobservable in CI through the production limiter alone.
 * `MCP_TEST_RATE_LIMITER=1` (`lib/mcp/rate-limit/select-limiter.ts`) swaps
 * in a deterministic, in-memory, ACTUALLY-enforcing limiter
 * (`lib/mcp/rate-limit/test-limiter.ts`) — hermetic, no network — used
 * exclusively by this suite's own server process. It is never set for the
 * default-config server `protocol.spec.ts` starts, and never set in
 * production/preview.
 *
 * This server also gets its own `RATELIMIT_MAX_REQUESTS` / `_WINDOW_SECONDS`
 * env, deliberately low, so a burst is cheap and the recovery-after-window
 * assertion below stays within a couple of seconds — no reliance on the
 * default 60-request/60s window.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StartedServer, startNextServer } from "./support/next-server";

// Generous enough that the SDK's own `connect()` handshake (which issues
// more than one HTTP request under the hood — the exact count is an SDK
// transport implementation detail this suite doesn't pin down) always
// completes within budget; the burst below deliberately blows past it with
// its own bounded loop instead of relying on an exact request count.
const RATE_LIMIT = 20;
const WINDOW_SECONDS = 3;
const MAX_BURST_REQUESTS = RATE_LIMIT + 10;

let server: StartedServer;

beforeAll(async () => {
  server = await startNextServer({
    MCP_TEST_RATE_LIMITER: "1",
    RATELIMIT_MAX_REQUESTS: String(RATE_LIMIT),
    RATELIMIT_WINDOW_SECONDS: String(WINDOW_SECONDS),
  });
}, 60_000);

afterAll(async () => {
  await server.stop();
});

function connectClient(): { client: Client; transport: StreamableHTTPClientTransport } {
  const client = new Client({ name: "mcp-e2e-rate-limit-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl));
  return { client, transport };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postToolsList(id: number): Promise<Response> {
  return fetch(server.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} }),
  });
}

describe("rate limiting (MCP_TEST_RATE_LIMITER=1, low configured limit)", () => {
  it("produces the documented 429 once a burst exceeds the limit, then recovers once the window elapses — no crashed or truncated stream", async () => {
    // The handshake itself must succeed cleanly — it's well within the
    // generous RATE_LIMIT budget reserved for it.
    const { client, transport } = connectClient();
    await client.connect(transport);
    const baseline = await client.callTool({ name: "ping", arguments: {} });
    expect(baseline.isError).not.toBe(true);

    // Burst past the limit with a bounded loop of raw requests (the
    // documented 429 shape is a plain HTTP response, so this doesn't
    // need the SDK client) until the first 429 appears.
    let limitedResponse: Response | undefined;
    for (let i = 0; i < MAX_BURST_REQUESTS && limitedResponse === undefined; i++) {
      const response = await postToolsList(i);
      if (response.status === 429) {
        limitedResponse = response;
      }
    }

    expect(limitedResponse).toBeDefined();
    const response = limitedResponse as Response;
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(response.headers.get("RateLimit-Limit")).toBe(String(RATE_LIMIT));
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message.length).toBeGreaterThan(0);

    await client.close();

    // Once the (short, deliberately low) window elapses, the server is
    // fully usable again — a fresh connection succeeds normally. This is
    // the "client can still be used or reconnected afterward" AC,
    // demonstrated as genuine recovery rather than just a clean error
    // shape.
    await sleep((WINDOW_SECONDS + 1) * 1000);

    const recovered = connectClient();
    await recovered.client.connect(recovered.transport);
    const result = await recovered.client.callTool({ name: "ping", arguments: {} });
    expect(result.isError).not.toBe(true);
    await recovered.client.close();
  }, 30_000);
});
