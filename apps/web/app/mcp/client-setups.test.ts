import {
  buildClientSnippets,
  renderClaudeCodeSnippet,
  renderMcpServersJson,
} from "@hire-me-mcp/connect-metadata";
import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../../lib/mcp/connection-metadata";
import { buildClientSetups } from "./client-setups";

const ENDPOINT_URL = "https://example.vercel.app/api/mcp";

describe("buildClientSetups (#43 per-client setup snippets, full parity per #250)", () => {
  it("builds exactly one setup per shared connect-metadata client — the same six the home widget renders", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    expect(setups.map((setup) => setup.id)).toEqual([
      "claude-web-desktop",
      "claude-code",
      "claude-desktop-json",
      "vscode-cursor",
      "curl-jsonrpc",
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

  it("gives VS Code / Cursor a valid mcp.json object with the endpoint under mcpServers.<name>.url", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    const vscodeCursor = setups.find((setup) => setup.id === "vscode-cursor");
    if (vscodeCursor === undefined) {
      throw new Error("expected a vscode-cursor setup entry");
    }
    const parsed = JSON.parse(vscodeCursor.snippet) as {
      mcpServers: Record<string, { url: string }>;
    };
    const [server] = Object.values(parsed.mcpServers);
    expect(server?.url).toBe(ENDPOINT_URL);
  });

  it("includes the raw curl snippet — the no-client-needed option #250 found missing from /mcp", () => {
    const setups = buildClientSetups(ENDPOINT_URL);
    const curl = setups.find((setup) => setup.id === "curl-jsonrpc");
    expect(curl?.snippet).toContain("curl");
    expect(curl?.snippet).toContain(ENDPOINT_URL);
  });

  it("delegates wholesale to @hire-me-mcp/connect-metadata's buildClientSnippets (#250) — /mcp can never again offer a subset of the home widget", () => {
    const metadata = buildConnectionMetadata(ENDPOINT_URL);
    const setups = buildClientSetups(ENDPOINT_URL);

    expect(setups).toEqual(buildClientSnippets(metadata));

    const claudeCode = setups.find((setup) => setup.id === "claude-code");
    expect(claudeCode?.snippet).toBe(renderClaudeCodeSnippet(metadata));

    const vscodeCursor = setups.find((setup) => setup.id === "vscode-cursor");
    expect(vscodeCursor?.snippet).toBe(renderMcpServersJson(metadata));
  });
});
