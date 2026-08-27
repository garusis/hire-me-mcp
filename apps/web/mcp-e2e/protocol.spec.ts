/**
 * Protocol-level MCP integration suite (#49): drives a real, locally
 * started production `next start` server with the real
 * `@modelcontextprotocol/sdk` client over Streamable HTTP — black-box, no
 * import of the route handlers. This is the goal-boundary the issue draws
 * against `app/api/mcp/route.test.ts` (in-process, same file the handlers
 * live in): this suite catches transport, serialization, and
 * schema-registration bugs an in-process test cannot, at the cost of a real
 * `next build` + `next start`.
 *
 * Runs against `packages/career-data`'s REAL content, so assertions here
 * are structural/invariant-based (shape, schema conformance, citation
 * well-formedness, non-empty where data is guaranteed to exist) — never an
 * exact career string, which would make this suite brittle against content
 * edits (explicitly out of scope per the issue).
 *
 * Own command (`pnpm test:mcp`, from `apps/web` or the repo root) and own
 * `vitest.mcp.config.ts` so it's distinguishable in CI output from the unit
 * suite (`pnpm turbo test`) — see the README "Protocol-level MCP
 * integration tests" section for how to run it locally.
 */

import { citationSchema } from "@hire-me-mcp/career-data";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { EXPECTED_TOOL_NAMES } from "../lib/mcp/tool-names";
import packageJson from "../package.json" with { type: "json" };
import { type StartedServer, startNextServer } from "./support/next-server";
import {
  getExperienceOutputSchema,
  getProfileOutputSchema,
  getSkillEvidenceOutputSchema,
  listEducationOutputSchema,
  listGapsOutputSchema,
  listProjectsOutputSchema,
  listRecommendationsOutputSchema,
  listSkillsOutputSchema,
  listWritingOutputSchema,
  searchProjectsOutputSchema,
} from "./support/tool-output-schemas";

let server: StartedServer;

beforeAll(async () => {
  server = await startNextServer();
}, 60_000);

afterAll(async () => {
  await server.stop();
});

function connectClient(): { client: Client; transport: StreamableHTTPClientTransport } {
  const client = new Client({ name: "mcp-e2e-test-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl));
  return { client, transport };
}

/**
 * An envelope citation as it must appear ON THE WIRE: the authored Citation
 * fields plus a resolvable absolute `url` (#247). Restated here rather than
 * imported from `lib/mcp/wire-schemas.ts` so this black-box suite checks the
 * promise ("citations back to the source") independently of the module that
 * implements it.
 */
const wireCitationSchema = citationSchema.extend({ url: z.url() });

/**
 * Asserts `citations` is a non-empty array of well-formed Citation records,
 * each carrying a resolvable absolute `url` back to its source (#247).
 */
function expectWellFormedCitations(citations: unknown): asserts citations is unknown[] {
  expect(Array.isArray(citations)).toBe(true);
  const list = citations as unknown[];
  expect(list.length).toBeGreaterThan(0);
  for (const citation of list) {
    const parsed = wireCitationSchema.safeParse(citation);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
  }
}

describe("initialize handshake", () => {
  it("returns the expected server name, version, and non-empty instructions", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBe("hire-me-mcp");
    expect(serverVersion?.version).toBe(packageJson.version);

    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    expect((instructions ?? "").length).toBeGreaterThan(0);

    await client.close();
  });
});

describe("tools/list", () => {
  it("returns exactly the expected tool set, each with a description and a valid input JSON Schema", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect((tool.description ?? "").length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(
        typeof tool.inputSchema.properties === "object" ||
          tool.inputSchema.properties === undefined,
      ).toBe(true);
    }

    await client.close();
  });

  it("advertises a human-readable title and read-only annotations for EVERY tool, with no tool exempt (#241)", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.length).toBe(EXPECTED_TOOL_NAMES.length);

    for (const tool of tools) {
      // A title a client can show a human instead of the kebab-case wire name.
      expect(tool.annotations?.title, `${tool.name} has no annotations.title`).toBeTruthy();
      expect(tool.annotations?.title).not.toContain("-");
      // This whole server reads one static career dataset over an anonymous,
      // public endpoint — every tool, present and future, is read-only.
      expect(tool.annotations, `${tool.name} is missing read-only hints`).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }

    await client.close();
  });

  it("advertises an outputSchema describing the { data, citations } envelope for EVERY tool (#242)", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const outputSchema = tool.outputSchema as
        | { type?: string; properties?: Record<string, unknown> }
        | undefined;
      expect(outputSchema, `${tool.name} advertises no outputSchema`).toBeDefined();
      expect(outputSchema).toMatchObject({ type: "object" });
      expect(
        Object.keys(outputSchema?.properties ?? {}),
        `${tool.name}'s outputSchema does not describe the shared envelope`,
      ).toEqual(expect.arrayContaining(["data", "citations"]));
    }

    await client.close();
  });
});

describe("tools/call — career tools", () => {
  it("get-profile succeeds and its result validates against the profile output shape, with well-formed citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "get-profile", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = getProfileOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    expectWellFormedCitations((result.structuredContent as { citations: unknown }).citations);

    await client.close();
  });

  it("get-experience succeeds and its result validates against the experience-list output shape, with well-formed citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "get-experience", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = getExperienceOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expectWellFormedCitations(structuredContent.citations);

    await client.close();
  });

  it("search-projects with a realistic query succeeds and its result validates against the search-result output shape, with well-formed citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "search-projects",
      arguments: { query: "typescript" },
    });

    expect(result.isError).not.toBe(true);
    const parsed = searchProjectsOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expectWellFormedCitations(structuredContent.citations);

    await client.close();
  });

  // Issue 275 — `search-projects` advertises search "by keyword AND/OR
  // technology tag", but `query` was in `required`, so the tag-only call
  // that promise invites failed validation on the real wire.
  it("search-projects accepts a TAG-ONLY call, exactly as its description promises (#275)", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "search-projects",
      arguments: { tags: ["typescript"] },
    });

    expect(result.isError).not.toBe(true);
    const parsed = searchProjectsOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expectWellFormedCitations(structuredContent.citations);

    await client.close();
  });

  it("get-skill-evidence for a claimed term succeeds and its result validates against the discriminated-union output shape, with well-formed citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "get-skill-evidence",
      arguments: { term: "typescript" },
    });

    expect(result.isError).not.toBe(true);
    const parsed = getSkillEvidenceOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as {
      data: { kind: string };
      citations: unknown;
    };
    // A structural, not exact-string, assertion: whatever the real dataset
    // claims for "typescript" today, the outcome must be one of the three
    // documented kinds, and a "claimed"/"not-claimed" outcome must carry
    // real evidence.
    expect(["claimed", "not-claimed", "unknown"]).toContain(structuredContent.data.kind);
    if (structuredContent.data.kind !== "unknown") {
      expectWellFormedCitations(structuredContent.citations);
    }

    await client.close();
  });

  it("search-career (#61): this job runs with no DATABASE_URL/GOOGLE_GENERATIVE_AI_API_KEY configured, so a call returns the server's standard sanitized error envelope, not a crash", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    // This suite's own CI job (`mcp-integration`) deliberately runs `next
    // start` with no DATABASE_URL/GOOGLE_GENERATIVE_AI_API_KEY set (see
    // .github/workflows/ci.yml) — the exact "graceful degradation"
    // scenario #61's acceptance criteria ask for, exercised here for real
    // rather than mocked (`apps/web/lib/mcp/tools/search-career.test.ts`
    // and `app/api/mcp/route.test.ts` cover the mocked/env-stubbed
    // versions of this same path).
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
    expect(payload.message).not.toMatch(/DATABASE_URL|GOOGLE_GENERATIVE_AI_API_KEY|postgres:\/\//i);

    // The connection remains usable afterwards — one tool's missing config
    // never breaks the server or the rest of the tool registry.
    const followUp = await client.callTool({ name: "ping", arguments: {} });
    expect(followUp.isError).not.toBe(true);

    await client.close();
  });

  it("search-career (#61) rejects a missing query as a documented validation failure, never reaching the (unconfigured) database", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "search-career", arguments: {} });

    expect(result.isError).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
    const [firstBlock] = result.content as Array<{ type: string; text?: string }>;
    expect(firstBlock?.type).toBe("text");
    expect(firstBlock?.text?.length ?? 0).toBeGreaterThan(0);

    await client.close();
  });

  it("get-skill-evidence for a term guaranteed not to exist returns the honest 'unknown' outcome, not an error", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "get-skill-evidence",
      arguments: { term: "definitely-not-a-real-skill-zzz-42" },
    });

    expect(result.isError).not.toBe(true);
    const structuredContent = result.structuredContent as { data: { kind: string } };
    expect(structuredContent.data.kind).toBe("unknown");

    await client.close();
  });
});

describe("tools/call — list tools (#211-#215)", () => {
  it("list-education succeeds against the real dataset with well-formed, aligned citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "list-education", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = listEducationOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expect(structuredContent.citations.length).toBe(structuredContent.data.length);
    expectWellFormedCitations(structuredContent.citations);

    await client.close();
  });

  it("list-skills with no filter returns the full inventory; a filter narrows it", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const all = await client.callTool({ name: "list-skills", arguments: {} });
    expect(all.isError).not.toBe(true);
    const parsedAll = listSkillsOutputSchema.safeParse(all.structuredContent);
    expect(
      parsedAll.success,
      parsedAll.success ? undefined : JSON.stringify(parsedAll.error?.issues),
    ).toBe(true);
    const allContent = all.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(allContent.data.length).toBeGreaterThan(0);
    expectWellFormedCitations(allContent.citations);

    const filtered = await client.callTool({
      name: "list-skills",
      arguments: { proficiency: "expert" },
    });
    expect(filtered.isError).not.toBe(true);
    const filteredContent = filtered.structuredContent as { data: unknown[] };
    expect(filteredContent.data.length).toBeLessThanOrEqual(allContent.data.length);

    await client.close();
  });

  it("list-skills with an unmatched category returns an honest empty list, not an error", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "list-skills",
      arguments: { category: "definitely-not-a-real-category-zzz" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ data: [], citations: [] });

    await client.close();
  });

  it("list-gaps succeeds: every gap carries a verbatim non-empty statement and aligned citations", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "list-gaps", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = listGapsOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expect(structuredContent.citations.length).toBe(structuredContent.data.length);
    expectWellFormedCitations(structuredContent.citations);

    await client.close();
  });

  it("list-projects enumerates the whole portfolio deterministically; an unmatched tag filter is an honest empty result", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "list-projects", arguments: {} });
    expect(result.isError).not.toBe(true);
    const parsed = listProjectsOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as {
      data: Array<{ id: string }>;
      citations: unknown[];
    };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expectWellFormedCitations(structuredContent.citations);
    // Deterministic order: id ascending.
    const ids = structuredContent.data.map((project) => project.id);
    expect(ids).toEqual([...ids].sort());

    const unmatched = await client.callTool({
      name: "list-projects",
      arguments: { tags: ["definitely-not-a-real-tag-zzz"] },
    });
    expect(unmatched.isError).not.toBe(true);
    expect(unmatched.structuredContent).toEqual({ data: [], citations: [] });

    await client.close();
  });

  it("list-writing returns a successful, well-formed result — an empty corpus is data, not an error", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "list-writing", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = listWritingOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    // No non-empty assertion: the writing corpus is currently empty, and the
    // honest empty list is exactly the documented, successful outcome. Citations
    // stay aligned 1:1 with data either way.
    const structuredContent = result.structuredContent as { data: unknown[]; citations: unknown[] };
    expect(structuredContent.citations.length).toBe(structuredContent.data.length);

    await client.close();
  });

  it("list-recommendations returns every recommendation verbatim, newest first, with aligned citations that resolve back to /recommendations (#190, #247)", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({ name: "list-recommendations", arguments: {} });

    expect(result.isError).not.toBe(true);
    const parsed = listRecommendationsOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error?.issues)).toBe(
      true,
    );
    const structuredContent = result.structuredContent as {
      data: Array<{ id: string; date: string; text: string }>;
      citations: Array<{ entityId: string; url: string }>;
    };
    expect(structuredContent.data.length).toBeGreaterThan(0);
    expect(structuredContent.citations.length).toBe(structuredContent.data.length);
    expectWellFormedCitations(structuredContent.citations);

    // Verbatim: no entry is truncated away to nothing by the adapter.
    for (const entry of structuredContent.data) {
      expect(entry.text.length).toBeGreaterThan(0);
    }

    // Deterministic order: reverse-chronological by date.
    const dates = structuredContent.data.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());

    // Each citation points at that recommendation's own card on the site,
    // rather than falling back to the home page for an unmapped entity type.
    for (const citation of structuredContent.citations) {
      expect(citation.url).toContain(`/recommendations#${citation.entityId}`);
    }

    await client.close();
  });
});

describe("error paths — documented MCP errors, not transport failures", () => {
  it("calling an unregistered tool name fails with a documented JSON-RPC error, not a transport crash", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    let caught: unknown;
    try {
      await client.callTool({ name: "not-a-real-tool", arguments: {} });
    } catch (error) {
      caught = error;
    }

    // The underlying `@modelcontextprotocol/server` maps an unregistered
    // tool name to InvalidParams (-32602, "Tool ... not found"), not
    // MethodNotFound — verified against the real running server rather
    // than assumed from the spec's error-code table. Either way, this is a
    // structured `McpError` with a real JSON-RPC code, never a raw
    // network/transport exception.
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as McpError).code).toBe(ErrorCode.InvalidParams);
    expect((caught as McpError).message).toContain("not-a-real-tool");

    // The connection itself must still be usable afterwards — an unknown
    // tool name is a documented protocol error, not a broken stream.
    const followUp = await client.callTool({ name: "ping", arguments: {} });
    expect(followUp.isError).not.toBe(true);

    await client.close();
  });

  it("calling a known tool with invalid arguments returns a documented tool-call error, not a transport failure", async () => {
    const { client, transport } = connectClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: "get-skill-evidence",
      // `term` is a required, non-empty string per get-skill-evidence's
      // input schema — an empty string is a documented validation failure.
      arguments: { term: "" },
    });

    // The registered `McpServer`'s own input-schema validation (run before
    // this server's `defineTool` executor — see `lib/mcp/define-tool.ts`)
    // rejects this call first, so the result carries only a descriptive
    // text block, not this project's own `{ code, message }`
    // `structuredContent` envelope (`lib/mcp/errors.ts`) — that envelope
    // is reachable for a domain/internal error, but a schema-shape
    // violation is caught upstream of it. Either way this is a normal
    // `isError: true` tool result, never a thrown transport exception.
    expect(result.isError).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
    const [firstBlock] = result.content as Array<{ type: string; text?: string }>;
    expect(firstBlock?.type).toBe("text");
    expect(firstBlock?.text?.length ?? 0).toBeGreaterThan(0);
    expect(firstBlock?.text).toMatch(/invalid|validation/i);

    // The connection remains usable afterwards.
    const followUp = await client.callTool({ name: "ping", arguments: {} });
    expect(followUp.isError).not.toBe(true);

    await client.close();
  });

  /**
   * Issue 276 — #244 made enum/format validation errors self-correcting
   * ("expected one of ...", "must be a YYYY-MM date") but left range and
   * length constraints emitting a bare "Invalid input", identically for
   * every violation, on this exact wire path. These assert the real text a
   * client receives, not the in-process executor's version, because the
   * registered `McpServer` validates first and relays the schema's own
   * message verbatim.
   */
  describe("range and length validation errors name the constraint (#276)", () => {
    async function errorTextFor(name: string, args: Record<string, unknown>): Promise<string> {
      const { client, transport } = connectClient();
      await client.connect(transport);
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      const [firstBlock] = result.content as Array<{ type: string; text?: string }>;
      await client.close();
      return firstBlock?.text ?? "";
    }

    it.each([0, -1, 51])("search-projects reports limit %s with its whole range", async (limit) => {
      const text = await errorTextFor("search-projects", { query: "typescript", limit });

      expect(text).toContain("limit: must be an integer between 1 and 50");
      expect(text).not.toContain("Invalid input");
    });

    it("search-career reports an over-length query with its whole length range", async () => {
      const text = await errorTextFor("search-career", { query: "a".repeat(3000) });

      expect(text).toMatch(/query: must be 1-\d+ characters after trimming/);
      expect(text).not.toContain("Invalid input");
    });

    it("search-career reports an out-of-range topK with its whole range", async () => {
      const text = await errorTextFor("search-career", { query: "typescript", topK: 0 });

      expect(text).toMatch(/topK: must be an integer between \d+ and \d+/);
      expect(text).not.toContain("Invalid input");
    });
  });
});
