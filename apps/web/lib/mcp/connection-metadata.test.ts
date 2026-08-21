import { describe, expect, it } from "vitest";
import { PRODUCTION_MCP_ENDPOINT_URL } from "../../src/lib/config/site-url";
import { buildConnectionMetadata as buildProductionConnectionMetadata } from "./connection-metadata";
import { EXPECTED_TOOL_NAMES } from "./tool-names";

/**
 * Binds `apps/web/lib/mcp/connection-metadata.ts` to the real tool registry
 * (#17's AC: "renaming a tool in the MCP server tool registry causes the
 * connect-metadata tests ... to fail"). `connection-metadata.ts` derives its
 * `tools` from `tool-catalogue.ts`, which is itself asserted elsewhere
 * (`tool-catalogue.test.ts`) to match `EXPECTED_TOOL_NAMES` — this test
 * closes the loop by asserting the *connection metadata* module's tool list
 * against the same list, so a rename anywhere in the chain fails loudly
 * here too, not just in tool-catalogue.test.ts.
 */
describe("apps/web connection metadata (#17)", () => {
  it("derives its tool list from the real MCP tool registry, matching EXPECTED_TOOL_NAMES exactly and in order", () => {
    const metadata = buildProductionConnectionMetadata(PRODUCTION_MCP_ENDPOINT_URL);
    expect(metadata.tools.map((tool) => tool.name)).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it("uses the given endpoint URL, not a hardcoded literal of its own", () => {
    const metadata = buildProductionConnectionMetadata(
      "https://a-preview-deploy.vercel.app/api/mcp",
    );
    expect(metadata.endpointUrl).toBe("https://a-preview-deploy.vercel.app/api/mcp");
  });

  it("names the server hire-me-mcp, matching the identity registered in app/api/mcp/route.ts", () => {
    const metadata = buildProductionConnectionMetadata(PRODUCTION_MCP_ENDPOINT_URL);
    expect(metadata.serverName).toBe("hire-me-mcp");
  });

  it("produces a schema-valid ConnectionMetadata object for the fixed production endpoint", () => {
    const metadata = buildProductionConnectionMetadata(PRODUCTION_MCP_ENDPOINT_URL);
    expect(metadata.endpointUrl).toBe(PRODUCTION_MCP_ENDPOINT_URL);
    expect(metadata.transport).toBe("streamable-http");
    expect(metadata.auth).toBe("none");
    expect(metadata.examplePrompts.length).toBeGreaterThanOrEqual(3);
    expect(metadata.examplePrompts.length).toBeLessThanOrEqual(5);
  });
});
