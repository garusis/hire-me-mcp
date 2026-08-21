import { describe, expect, it, vi } from "vitest";

const { renderLlmsFullTxt } = vi.hoisted(() => ({ renderLlmsFullTxt: vi.fn() }));
vi.mock("../../lib/llms/generate-llms", () => ({ renderLlmsFullTxt }));

const { getSiteUrl, getMcpEndpointUrl } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getMcpEndpointUrl: vi.fn(),
}));
vi.mock("../../src/lib/config/site-url", () => ({ getSiteUrl, getMcpEndpointUrl }));

describe("GET /llms-full.txt", () => {
  it("returns 200 with a text/plain; charset=utf-8 content type", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsFullTxt.mockReturnValue("# hire-me-mcp\n");
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("serves the body rendered from the runtime site URL and MCP endpoint URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsFullTxt.mockReturnValue("# hire-me-mcp\n\n## Tools\n");
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.text();

    expect(body).toBe("# hire-me-mcp\n\n## Tools\n");
    expect(renderLlmsFullTxt).toHaveBeenCalledWith({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });
  });
});
