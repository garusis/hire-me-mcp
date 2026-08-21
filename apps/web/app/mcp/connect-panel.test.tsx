import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientSnippet } from "@hire-me-mcp/connect-metadata";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { DeepLink } from "./client-deep-links.js";
import { ConnectPanel } from "./connect-panel.js";

const ENDPOINT_URL = "https://stub-deploy.vercel.app/api/mcp";

const SNIPPETS: ClientSnippet[] = [
  {
    id: "claude-web-desktop",
    label: "Claude (web/desktop)",
    instructions: "Paste the URL into Settings → Connectors.",
    snippet: ENDPOINT_URL,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    instructions: "Run this from a terminal:",
    snippet: `claude mcp add --transport http hire-me-mcp ${ENDPOINT_URL}`,
  },
  {
    id: "vscode-cursor",
    label: "VS Code / Cursor",
    instructions: "Add this to mcp.json:",
    snippet: `{"mcpServers":{"hire-me-mcp":{"url":"${ENDPOINT_URL}"}}}`,
  },
  // A client the current known ClientId union doesn't include yet, asserted
  // as a plain string on purpose — proves the panel renders whatever
  // `snippets` it's given rather than switching on a hand-enumerated list
  // of known ids (#45's "adding a client makes it appear with no component
  // change" AC).
  {
    id: "brand-new-client" as ClientSnippet["id"],
    label: "Brand New Client",
    instructions: "Do the brand-new-client thing:",
    snippet: `brand-new-client connect ${ENDPOINT_URL}`,
  },
];

const EXAMPLE_PROMPTS = [
  "Who is Marcos Alvarez, and is he open to new roles?",
  "What has he worked on since 2022?",
  "Show me projects where he used TypeScript.",
];

const DEEP_LINKS: Partial<Record<string, DeepLink[]>> = {
  "vscode-cursor": [
    {
      id: "cursor",
      label: "Open in Cursor",
      href: "cursor://anysphere.cursor-deeplink/mcp/install?name=hire-me-mcp&config=stub",
    },
    { id: "vscode", label: "Open in VS Code", href: "vscode:mcp/install?stub" },
  ],
};

describe("ConnectPanel (#45)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one tab per entry in `snippets`, including a client id the panel has never seen before", () => {
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
      />,
    );

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Claude (web/desktop)",
      "Claude Code",
      "VS Code / Cursor",
      "Brand New Client",
    ]);
  });

  it("renders the selected client's snippet as selectable text with a copy button", async () => {
    const user = userEvent.setup();
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));

    expect(screen.getByText(/claude mcp add/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy.*claude code.*snippet/i })).toBeInTheDocument();
  });

  it("defaults to the first client in `snippets` as the selected tab", () => {
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
      />,
    );

    expect(screen.getByRole("tab", { name: "Claude (web/desktop)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders an endpoint URL copy button", () => {
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
      />,
    );

    expect(screen.getAllByText(ENDPOINT_URL).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /copy.*endpoint|copy.*url/i })).toBeInTheDocument();
  });

  it("renders at least 3 example prompts from the given list", () => {
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
      />,
    );

    for (const prompt of EXAMPLE_PROMPTS) {
      expect(screen.getByText(prompt)).toBeInTheDocument();
    }
  });

  it("renders a deep link for a client with one, as a real link alongside the manual snippet (never replacing it)", async () => {
    const user = userEvent.setup();
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
        deepLinksByClientId={DEEP_LINKS}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "VS Code / Cursor" }));

    const cursorLink = screen.getByRole("link", { name: "Open in Cursor" });
    expect(cursorLink).toHaveAttribute(
      "href",
      "cursor://anysphere.cursor-deeplink/mcp/install?name=hire-me-mcp&config=stub",
    );
    const vscodeLink = screen.getByRole("link", { name: "Open in VS Code" });
    expect(vscodeLink).toHaveAttribute("href", "vscode:mcp/install?stub");
    // The manual snippet is still visible next to the deep links.
    expect(screen.getByText(/mcpServers/)).toBeInTheDocument();
  });

  it("renders no deep link for a client absent from deepLinksByClientId", async () => {
    const user = userEvent.setup();
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
        deepLinksByClientId={DEEP_LINKS}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders an optional link to a detail route when detailHref is given", () => {
    render(
      <ConnectPanel
        snippets={SNIPPETS}
        examplePrompts={EXAMPLE_PROMPTS}
        endpointUrl={ENDPOINT_URL}
        detailHref="/mcp"
      />,
    );

    const link = screen.getByRole("link", { name: /full setup|tools|explore/i });
    expect(link).toHaveAttribute("href", "/mcp");
  });

  it("has no hardcoded MCP endpoint URL or tool name literal in its own source (#45)", () => {
    const filePath = join(dirname(fileURLToPath(import.meta.url)), "connect-panel.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).not.toMatch(/https?:\/\/[^\s"'`]*\/api\/mcp/);
    expect(source).not.toMatch(/\bget-profile\b|\bget-experience\b|\bsearch-projects\b/);
  });
});
