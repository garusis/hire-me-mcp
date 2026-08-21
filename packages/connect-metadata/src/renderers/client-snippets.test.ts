import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../build-connection-metadata";
import { clientIdSchema } from "../schema";
import { buildClientSnippets } from "./client-snippets";

const METADATA = buildConnectionMetadata({
  serverName: "hire-me-mcp",
  description: "A public MCP server over career data.",
  endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
  tools: [
    { name: "ping", description: "Connectivity check.", examplePrompt: "Ping the server." },
    {
      name: "get-profile",
      description: "Returns the profile record.",
      examplePrompt: "Who is Marcos Alvarez?",
    },
    {
      name: "get-experience",
      description: "Returns work history.",
      examplePrompt: "What has he worked on?",
    },
  ],
});

describe("buildClientSnippets", () => {
  it("builds one snippet per known client id, each a valid clientIdSchema member", () => {
    const snippets = buildClientSnippets(METADATA);
    expect(snippets.length).toBeGreaterThanOrEqual(4);
    for (const snippet of snippets) {
      expect(() => clientIdSchema.parse(snippet.id)).not.toThrow();
    }
  });

  it("covers at least Claude Code, Claude Desktop JSON, VS Code/Cursor, and raw JSON-RPC", () => {
    const ids = buildClientSnippets(METADATA).map((snippet) => snippet.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "claude-code",
        "claude-desktop-json",
        "vscode-cursor",
        "curl-jsonrpc",
      ]),
    );
  });

  it("every snippet embeds the metadata's endpoint URL", () => {
    for (const snippet of buildClientSnippets(METADATA)) {
      expect(snippet.snippet).toContain(METADATA.endpointUrl);
    }
  });

  it("every JSON-shaped client snippet (claude-desktop-json, vscode-cursor) is valid JSON matching mcpServers.<name>.url", () => {
    const snippets = buildClientSnippets(METADATA);
    for (const id of ["claude-desktop-json", "vscode-cursor"] as const) {
      const entry = snippets.find((snippet) => snippet.id === id);
      if (!entry) throw new Error(`expected a ${id} snippet`);
      const parsed = JSON.parse(entry.snippet) as { mcpServers: Record<string, { url: string }> };
      expect(parsed.mcpServers[METADATA.serverName]?.url).toBe(METADATA.endpointUrl);
    }
  });

  it("does not produce duplicate client ids", () => {
    const ids = buildClientSnippets(METADATA).map((snippet) => snippet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
