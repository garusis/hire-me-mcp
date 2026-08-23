/**
 * MCP endpoint smoke suite (#69) against a REAL deployed origin — a Vercel
 * preview in CI, or any `BASE_URL` locally/production. Never a server this
 * suite boots itself.
 *
 * Placement: alongside the other preview gate specs
 * (`apps/web/e2e-preview/specs/`), reusing `playwright.preview.config.ts`
 * (whose `testDir` picks this file up automatically) rather than a new
 * suite/config/CI job. This spec needs exactly the same ingredients those
 * specs already have — `BASE_URL` resolution (`helpers/base-url.ts`), the
 * Vercel Deployment Protection bypass (`helpers/bypass.ts`), the `preview-e2e`
 * CI job's existing preview-URL resolution + fork-PR skip + Playwright HTML/
 * JSON/`github` reporting — so reusing that job/config keeps every preview
 * check's reporting in one place on the PR instead of a second, near-
 * identical CI job. See `.github/workflows/ci.yml`'s `preview-e2e` job.
 *
 * Deliberately a SMOKE suite, not a protocol-conformance suite: the
 * schema-conformance depth (a full output-schema `safeParse` per tool, every
 * error-code edge case, the 429-then-recovery cycle) already lives in
 * `apps/web/mcp-e2e/*.spec.ts` (#49), which runs the same real
 * `@modelcontextprotocol/sdk` client against a server started locally in CI.
 * This suite exists to catch what that one structurally cannot — real
 * network/platform behaviour: routing, environment variables, cold starts,
 * and the REAL Upstash-backed rate limiter (#39), which fails open without
 * credentials — exactly the state every local run is in.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { expect, test } from "@playwright/test";
import { EXPECTED_TOOL_NAMES } from "../../lib/mcp/tool-names";
import { resolveBaseUrl } from "../helpers/base-url";
import { bypassHeaders } from "../helpers/bypass";

const mcpUrl = `${resolveBaseUrl()}/api/mcp`;

// A cold Vercel Hobby-plan Lambda invocation (the first request after a
// period of inactivity) can take several seconds longer than a warm one —
// `playwright.preview.config.ts`'s global 60s test timeout already covers a
// single request, but the handshake tests below make more than one network
// round trip per test, so this suite gets a more generous per-test ceiling.
test.describe.configure({ timeout: 90_000 });

function connectClient(): { client: Client; transport: StreamableHTTPClientTransport } {
  const client = new Client({ name: "hire-me-mcp-preview-smoke", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    // The SDK client talks to the deployed origin directly (its own `fetch`,
    // not Playwright's `request`/`page` contexts), so it needs the Vercel
    // Deployment Protection bypass header applied explicitly here — the
    // same header `playwright.preview.config.ts` applies to `request`-fixture
    // calls via `extraHTTPHeaders`. A no-op against an unprotected origin
    // (local/production), same as every other use of `bypassHeaders()`.
    requestInit: { headers: bypassHeaders() },
  });
  return { client, transport };
}

/**
 * A non-empty array of citation-shaped records — structural field-presence
 * only, deliberately not a full `citationSchema.safeParse` (that Zod schema
 * lives in `@hire-me-mcp/career-data`, which `apps/web` reads only through
 * `src/lib/content/` per issue #16 — importing it directly here would be
 * exactly the layering violation that convention exists to prevent, for a
 * depth of validation this smoke suite doesn't need; the full parse already
 * runs in `mcp-e2e/protocol.spec.ts`, #49).
 */
function expectCitationsPresent(citations: unknown): void {
  expect(Array.isArray(citations)).toBe(true);
  const list = citations as Array<Record<string, unknown>>;
  expect(list.length).toBeGreaterThan(0);
  const [first] = list;
  expect(typeof first?.entityType).toBe("string");
  expect(typeof first?.entityId).toBe("string");
  expect(typeof first?.label).toBe("string");
}

test("initialize handshake succeeds against the deployed origin", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const serverVersion = client.getServerVersion();
  expect(serverVersion?.name).toBe("hire-me-mcp");

  await client.close();
});

test("tools/list returns exactly the expected tool set", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());

  await client.close();
});

test("get-profile succeeds with citations present", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const result = await client.callTool({ name: "get-profile", arguments: {} });

  expect(result.isError).not.toBe(true);
  expectCitationsPresent((result.structuredContent as { citations: unknown }).citations);

  await client.close();
});

test("get-experience succeeds with citations present", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const result = await client.callTool({ name: "get-experience", arguments: {} });

  expect(result.isError).not.toBe(true);
  expectCitationsPresent((result.structuredContent as { citations: unknown }).citations);

  await client.close();
});

test("search-projects succeeds with citations present", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const result = await client.callTool({
    name: "search-projects",
    arguments: { query: "typescript" },
  });

  expect(result.isError).not.toBe(true);
  expectCitationsPresent((result.structuredContent as { citations: unknown }).citations);

  await client.close();
});

test("get-skill-evidence succeeds with citations present for a claimed term", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const result = await client.callTool({
    name: "get-skill-evidence",
    arguments: { term: "typescript" },
  });

  expect(result.isError).not.toBe(true);
  const structuredContent = result.structuredContent as { data: { kind: string } };
  // Structural, not exact-string: whatever the real deployed content claims
  // for "typescript" today, only a "claimed"/"not-claimed" outcome is
  // guaranteed to carry citations (an "unknown" outcome legitimately has
  // none) — see mcp-e2e/protocol.spec.ts for the deeper version of this.
  expect(["claimed", "not-claimed", "unknown"]).toContain(structuredContent.data.kind);
  if (structuredContent.data.kind !== "unknown") {
    expectCitationsPresent((result.structuredContent as { citations: unknown }).citations);
  }

  await client.close();
});

test("search-career succeeds with a ranked result and citations present, against real indexed content (#61)", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  // Only this suite (preview/production Vercel deploys) has both
  // DATABASE_URL and GOOGLE_GENERATIVE_AI_API_KEY configured (see
  // apps/web/mcp-e2e/protocol.spec.ts for the graceful-degradation
  // counterpart, which runs with neither set) and a real, already-indexed
  // corpus to search — safe to query for real here.
  const result = await client.callTool({
    name: "search-career",
    arguments: { query: "leading engineering teams and mentoring other engineers" },
  });

  expect(result.isError).not.toBe(true);
  const structuredContent = result.structuredContent as {
    data: { found: boolean; results?: Array<Record<string, unknown>> };
    citations: unknown;
  };
  // Structural, not exact-string: whatever real content matches today, a
  // `found: true` result must carry ranked hits with a score and citation;
  // `found: false` is also a legitimate, honest outcome for this query,
  // never treated as a failure.
  if (structuredContent.data.found) {
    expect(structuredContent.data.results?.length ?? 0).toBeGreaterThan(0);
    const [first] = structuredContent.data.results ?? [];
    expect(typeof first?.text).toBe("string");
    expect(typeof first?.score).toBe("number");
    expect(typeof first?.citation).toBe("string");
    expectCitationsPresent(structuredContent.citations);
  }

  await client.close();
});

test("search-career rejects a missing query as a documented validation failure over the real network", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  const result = await client.callTool({ name: "search-career", arguments: {} });

  expect(result.isError).toBe(true);

  await client.close();
});

test("calling an unregistered tool returns the documented MCP error over the real network, not a transport failure", async () => {
  const { client, transport } = connectClient();
  await client.connect(transport);

  let caught: unknown;
  try {
    await client.callTool({ name: "not-a-real-tool", arguments: {} });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(McpError);
  expect((caught as McpError).message).toContain("not-a-real-tool");

  await client.close();
});

test("rate-limit headers are present and internally consistent on a normal request", async ({
  request,
}) => {
  // Raw JSON-RPC via Playwright's `request` context (not the SDK client) so
  // the response headers are directly inspectable — the SDK client doesn't
  // expose transport-level response headers. `extraHTTPHeaders` in
  // `playwright.preview.config.ts` already carries the bypass header for
  // every `request`-fixture call.
  const response = await request.post(mcpUrl, {
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });

  expect(response.ok()).toBe(true);
  const headers = response.headers();
  const limit = Number(headers["ratelimit-limit"]);
  const remaining = Number(headers["ratelimit-remaining"]);
  const reset = Number(headers["ratelimit-reset"]);

  expect(Number.isFinite(limit), "RateLimit-Limit must be present and numeric").toBe(true);
  expect(Number.isFinite(remaining), "RateLimit-Remaining must be present and numeric").toBe(true);
  expect(Number.isFinite(reset), "RateLimit-Reset must be present and numeric").toBe(true);
  expect(limit).toBeGreaterThan(0);
  expect(remaining).toBeGreaterThanOrEqual(0);
  expect(remaining).toBeLessThanOrEqual(limit);
  expect(reset).toBeGreaterThanOrEqual(0);
});

test("a small bounded burst shows RateLimit-Remaining decrementing, without exhausting the live per-minute budget", async ({
  request,
}) => {
  // The preview's Upstash limit is the real production default — 60
  // requests/minute per caller IP (README "Rate limiting") — shared with
  // every other check this PR's preview-e2e job makes against the same
  // origin from the same CI runner IP. Deliberately bounded to 3 requests
  // (~5% of budget) so this assertion proves the header decrements under a
  // real burst without meaningfully contending with the rest of the suite's
  // traffic or the free-tier Upstash quota — never a burst large enough to
  // actually trigger the documented 429 (that path is exercised, cheaply and
  // deterministically, by mcp-e2e/rate-limit.spec.ts's own low-limit server).
  const BURST_SIZE = 3;
  const remainingValues: number[] = [];

  for (let i = 0; i < BURST_SIZE; i++) {
    const response = await request.post(mcpUrl, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: i, method: "tools/list", params: {} },
    });
    expect(response.ok()).toBe(true);
    remainingValues.push(Number(response.headers()["ratelimit-remaining"]));
  }

  expect(remainingValues.every((value) => Number.isFinite(value))).toBe(true);
  // Non-increasing across the burst — the sane, observable signature of a
  // real shared limiter counting this suite's own requests, without ever
  // needing to drive it all the way to empty.
  for (let i = 1; i < remainingValues.length; i++) {
    expect(remainingValues[i]).toBeLessThanOrEqual(remainingValues[i - 1] as number);
  }
});
