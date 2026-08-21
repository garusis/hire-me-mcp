import { describe, expect, it, vi } from "vitest";

const { renderLlmsTxt } = vi.hoisted(() => ({ renderLlmsTxt: vi.fn() }));
vi.mock("../../lib/llms/generate-llms", () => ({ renderLlmsTxt }));

const { getSiteUrl, getMcpEndpointUrl } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getMcpEndpointUrl: vi.fn(),
}));
vi.mock("../../src/lib/config/site-url", () => ({ getSiteUrl, getMcpEndpointUrl }));

describe("GET /llms.txt", () => {
  it("returns 200 with a text/plain; charset=utf-8 content type", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsTxt.mockReturnValue("# hire-me-mcp\n");
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("serves the body rendered from the runtime site URL and MCP endpoint URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    renderLlmsTxt.mockReturnValue("# hire-me-mcp\n\n> stub blurb\n");
    const { GET } = await import("./route.js");

    const response = await GET();
    const body = await response.text();

    expect(body).toBe("# hire-me-mcp\n\n> stub blurb\n");
    expect(renderLlmsTxt).toHaveBeenCalledWith({
      siteUrl: "https://stub-deploy.example.com",
      endpointUrl: "https://stub-deploy.example.com/api/mcp",
    });
  });
});
