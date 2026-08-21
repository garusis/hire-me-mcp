import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../build-connection-metadata";
import { renderClaudeCodeSnippet } from "./claude-code";

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

describe("renderClaudeCodeSnippet", () => {
  it("renders a `claude mcp add --transport http` command", () => {
    const snippet = renderClaudeCodeSnippet(METADATA);
    expect(snippet).toContain("claude mcp add");
    expect(snippet).toContain("--transport http");
  });

  it("embeds the server name and endpoint URL from metadata, not a hardcoded literal", () => {
    const snippet = renderClaudeCodeSnippet(METADATA);
    expect(snippet).toBe(
      "claude mcp add --transport http hire-me-mcp https://hire-me-mcp-web.vercel.app/api/mcp",
    );
  });

  it("changes when the endpoint URL changes — nothing about it is hardcoded", () => {
    const other = buildConnectionMetadata({
      serverName: "hire-me-mcp",
      description: "A public MCP server over career data.",
      endpointUrl: "https://a-different-deploy.vercel.app/api/mcp",
      tools: METADATA.tools,
    });
    expect(renderClaudeCodeSnippet(other)).toContain(
      "https://a-different-deploy.vercel.app/api/mcp",
    );
    expect(renderClaudeCodeSnippet(other)).not.toContain("hire-me-mcp-web.vercel.app");
  });
});
