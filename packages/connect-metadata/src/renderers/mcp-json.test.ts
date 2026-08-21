import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../build-connection-metadata";
import { renderMcpServersJson } from "./mcp-json";

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

describe("renderMcpServersJson", () => {
  it("renders valid JSON", () => {
    expect(() => JSON.parse(renderMcpServersJson(METADATA))).not.toThrow();
  });

  it("matches the `{ mcpServers: { <name>: { url } } }` shape shared by Claude Desktop, Cursor, and VS Code", () => {
    const parsed = JSON.parse(renderMcpServersJson(METADATA)) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(parsed.mcpServers["hire-me-mcp"]?.url).toBe(
      "https://hire-me-mcp-web.vercel.app/api/mcp",
    );
  });

  it("keys the server entry by the metadata's serverName, not a hardcoded literal", () => {
    const renamed = buildConnectionMetadata({
      serverName: "some-other-server",
      description: METADATA.description,
      endpointUrl: METADATA.endpointUrl,
      tools: METADATA.tools,
    });
    const parsed = JSON.parse(renderMcpServersJson(renamed)) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(Object.keys(parsed.mcpServers)).toEqual(["some-other-server"]);
  });
});
