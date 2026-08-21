import { renderClaudeCodeSnippet, renderMcpServersJson } from "@hire-me-mcp/connect-metadata";
import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../../lib/mcp/connection-metadata";
import { buildClientSetups } from "./client-setups";

const ENDPOINT_URL = "https://example.vercel.app/api/mcp";

describe("buildClientSetups (#43 per-client setup snippets)", () => {
  it("builds exactly one setup per supported client: Claude web/desktop, Claude Code, Cursor, generic MCP client", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    expect(setups.map((setup) => setup.id)).toEqual([
      "claude-web-desktop",
      "claude-code",
      "cursor",
      "generic",
    ]);
  });

  it("every snippet embeds the given endpoint URL — the same string passed in, nowhere re-derived", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    for (const setup of setups) {
      expect(setup.snippet).toContain(ENDPOINT_URL);
    }
  });

  it("changing the endpoint URL changes every snippet — no client setup hardcodes a literal URL of its own", () => {
    const otherUrl = "https://a-completely-different-preview-deploy.vercel.app/api/mcp";
    const setups = buildClientSetups(otherUrl);
    for (const setup of setups) {
      expect(setup.snippet).toContain(otherUrl);
      expect(setup.snippet).not.toContain(ENDPOINT_URL);
    }
  });

  it("gives Claude Code a copy-paste-ready CLI command using the http transport", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    const claudeCode = setups.find((setup) => setup.id === "claude-code");
    expect(claudeCode?.snippet).toContain("claude mcp add");
    expect(claudeCode?.snippet).toContain("--transport http");
  });

  it("gives Cursor a valid mcp.json object with the endpoint under mcpServers.<name>.url", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    const cursor = setups.find((setup) => setup.id === "cursor");
    if (cursor === undefined) {
      throw new Error("expected a cursor setup entry");
    }
    const parsed = JSON.parse(cursor.snippet) as {
      mcpServers: Record<string, { url: string }>;
    };
    const [server] = Object.values(parsed.mcpServers);
    expect(server?.url).toBe(ENDPOINT_URL);
  });

  it("delegates to @hire-me-mcp/connect-metadata's shared renderers (#17) instead of re-deriving snippets of its own", () => {
    const metadata = buildConnectionMetadata(ENDPOINT_URL);
    const setups = buildClientSetups(ENDPOINT_URL);

    const claudeCode = setups.find((setup) => setup.id === "claude-code");
    expect(claudeCode?.snippet).toBe(renderClaudeCodeSnippet(metadata));

    const cursor = setups.find((setup) => setup.id === "cursor");
    expect(cursor?.snippet).toBe(renderMcpServersJson(metadata));
  });
});
