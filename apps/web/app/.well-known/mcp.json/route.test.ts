import type { ConnectionMetadata } from "@hire-me-mcp/connect-metadata";
import { describe, expect, it, vi } from "vitest";

const { buildConnectionMetadata } = vi.hoisted(() => ({ buildConnectionMetadata: vi.fn() }));
vi.mock("../../../lib/mcp/connection-metadata", () => ({ buildConnectionMetadata }));

const { getMcpEndpointUrl } = vi.hoisted(() => ({ getMcpEndpointUrl: vi.fn() }));
vi.mock("../../../src/lib/config/site-url", () => ({ getMcpEndpointUrl }));

function stubMetadata(): ConnectionMetadata {
  return {
    serverName: "hire-me-mcp",
    description: "A stub description.",
    endpointUrl: "https://stub-deploy.example.com/api/mcp",
    transport: "streamable-http",
    auth: "none",
    tools: [{ name: "get_profile", description: "Stub tool.", examplePrompt: "Stub prompt." }],
    examplePrompts: ["Prompt one.", "Prompt two.", "Prompt three."],
  };
}

/**
 * `GET /.well-known/mcp.json` (#38) — a project-convention descriptor, NOT
 * defined by the MCP spec (see the route's module doc), rendered straight
 * from `apps/web/lib/mcp/connection-metadata.ts` — the same module the
 * `/mcp` page and `/llms.txt` already read from — so it can never drift
 * from the real tool registry or endpoint URL.
 */
describe("GET /.well-known/mcp.json", () => {
  it("returns 200 with an application/json content type", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    buildConnectionMetadata.mockReturnValue(stubMetadata());
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("serves a body built from the runtime MCP endpoint URL, matching the connection metadata module exactly", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    const metadata = stubMetadata();
    buildConnectionMetadata.mockReturnValue(metadata);
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.json();

    expect(buildConnectionMetadata).toHaveBeenCalledWith("https://stub-deploy.example.com/api/mcp");
    expect(body).toEqual(metadata);
  });

  it("advertises the no-auth model and streamable-http transport straight from the metadata module", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    buildConnectionMetadata.mockReturnValue(stubMetadata());
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.json();

    expect(body.auth).toBe("none");
    expect(body.transport).toBe("streamable-http");
    expect(body.tools).toEqual(stubMetadata().tools);
  });
});
