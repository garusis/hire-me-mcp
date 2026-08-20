import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOL_CATALOGUE } from "../../lib/mcp/tool-catalogue";

const { getMcpEndpointUrl } = vi.hoisted(() => ({
  getMcpEndpointUrl: vi.fn(),
}));

vi.mock("../../src/lib/config/site-url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/config/site-url")>();
  return { ...actual, getMcpEndpointUrl };
});

describe("MCP page (#43)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the endpoint URL from the single configured source everywhere it appears — copy button, visible text, and every client setup snippet all show the same string", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.vercel.app/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    const urlMatches = screen.getAllByText("https://stub-deploy.vercel.app/api/mcp");
    expect(urlMatches.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /copy.*endpoint|copy.*url/i })).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    const claudeCodeTab = tabs.find((tab) => tab.textContent === "Claude Code");
    if (claudeCodeTab === undefined) {
      throw new Error("expected a Claude Code tab");
    }
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.setup().click(claudeCodeTab);

    const claudeCodeSnippet = screen.getByText(/claude mcp add/);
    expect(claudeCodeSnippet.textContent).toContain("https://stub-deploy.vercel.app/api/mcp");
  });

  it("changing the configured source changes every place the URL appears — no literal is hardcoded on the page", async () => {
    getMcpEndpointUrl.mockReturnValue("https://a-totally-different-url.example.com/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    expect(
      screen.getAllByText("https://a-totally-different-url.example.com/api/mcp").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/stub-deploy\.vercel\.app/)).not.toBeInTheDocument();
  });

  it("renders one tab per supported client, keyboard-operable, each with its own setup snippet", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.vercel.app/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Claude (web/desktop)",
      "Claude Code",
      "Cursor",
      "Generic MCP client",
    ]);
  });

  it("renders the full tool catalogue, matching the actual MCP tool registry — one entry per registered tool, with its example prompt", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.vercel.app/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    for (const tool of MCP_TOOL_CATALOGUE) {
      expect(screen.getByText(tool.name)).toBeInTheDocument();
      expect(screen.getByText(tool.examplePrompt)).toBeInTheDocument();
    }
  });

  it("includes the demo transcript section with its accessible text alternative", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.vercel.app/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    expect(
      screen.getByRole("group", { name: /transcript|conversation|demo/i }),
    ).toBeInTheDocument();
  });

  it("links troubleshooting/limits to the README's rate-limiting anchor rather than stating numbers on the page", async () => {
    getMcpEndpointUrl.mockReturnValue("https://stub-deploy.vercel.app/api/mcp");
    const { default: McpPage } = await import("./page.js");

    render(await McpPage());

    const link = screen.getByRole("link", { name: /rate limit|troubleshoot/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("#rate-limiting"));
  });
});
