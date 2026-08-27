import { describe, expect, it, vi } from "vitest";

const { getCvView } = vi.hoisted(() => ({ getCvView: vi.fn() }));
vi.mock("../../../src/lib/content", () => ({ getCvView }));

const { renderCvHtml } = vi.hoisted(() => ({ renderCvHtml: vi.fn() }));
vi.mock("../../../lib/cv/render-cv-html", () => ({ renderCvHtml }));

const { getSiteUrl, getMcpEndpointUrl } = vi.hoisted(() => ({
  getSiteUrl: vi.fn(),
  getMcpEndpointUrl: vi.fn(),
}));
vi.mock("../../../src/lib/config/site-url", () => ({ getSiteUrl, getMcpEndpointUrl }));

describe("GET /cv/print", () => {
  it("returns 200 with a text/html; charset=utf-8 content type", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    getCvView.mockReturnValue({ profile: { name: "Stub Person" } });
    renderCvHtml.mockReturnValue("<!doctype html><html><body>stub</body></html>");
    const { GET } = await import("./route.js");

    const response = await GET(new Request("https://stub-deploy.example.com/cv/print"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("serves the body rendered from the CV view and the runtime site URL", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    const stubView = { profile: { name: "Stub Person" } };
    getCvView.mockReturnValue(stubView);
    renderCvHtml.mockReturnValue("<!doctype html><html><body>stub cv</body></html>");
    const { GET } = await import("./route.js");

    const response = await GET(new Request("https://stub-deploy.example.com/cv/print"));
    const body = await response.text();

    expect(body).toBe("<!doctype html><html><body>stub cv</body></html>");
    expect(renderCvHtml).toHaveBeenCalledWith(stubView, {
      siteUrl: "https://stub-deploy.example.com",
      mcpUrl: "https://stub-deploy.example.com/api/mcp",
      nonce: undefined,
    });
  });

  it("forwards the proxy's x-nonce request header so the inline print CSS passes CSP (#76)", async () => {
    getSiteUrl.mockReturnValue("https://stub-deploy.example.com");
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.example.com/api/mcp");
    const stubView = { profile: { name: "Stub Person" } };
    getCvView.mockReturnValue(stubView);
    renderCvHtml.mockReturnValue("<!doctype html><html><body>stub cv</body></html>");
    const { GET } = await import("./route.js");

    await GET(
      new Request("https://stub-deploy.example.com/cv/print", {
        headers: { "x-nonce": "stub-nonce" },
      }),
    );

    expect(renderCvHtml).toHaveBeenCalledWith(stubView, {
      siteUrl: "https://stub-deploy.example.com",
      mcpUrl: "https://stub-deploy.example.com/api/mcp",
      nonce: "stub-nonce",
    });
  });
});
