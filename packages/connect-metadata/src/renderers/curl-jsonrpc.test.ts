import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "../build-connection-metadata";
import { renderCurlJsonRpcSnippet } from "./curl-jsonrpc";

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

function extractJsonPayload(snippet: string): string {
  const match = snippet.match(/-d '(.*)'/s);
  if (!match?.[1]) {
    throw new Error("expected the snippet to contain a `-d '<json>'` payload");
  }
  return match[1];
}

describe("renderCurlJsonRpcSnippet", () => {
  it("targets the metadata's endpoint URL with curl", () => {
    const snippet = renderCurlJsonRpcSnippet(METADATA);
    expect(snippet).toContain("curl");
    expect(snippet).toContain(METADATA.endpointUrl);
  });

  it("embeds a valid JSON-RPC `initialize` request body any agent can run without installing anything", () => {
    const snippet = renderCurlJsonRpcSnippet(METADATA);
    const payload = JSON.parse(extractJsonPayload(snippet)) as {
      jsonrpc: string;
      method: string;
      params: { protocolVersion: string };
    };
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.method).toBe("initialize");
    expect(payload.params.protocolVersion).toEqual(expect.any(String));
  });

  it("changes the target URL when the endpoint changes", () => {
    const other = buildConnectionMetadata({
      serverName: METADATA.serverName,
      description: METADATA.description,
      endpointUrl: "https://a-different-deploy.vercel.app/api/mcp",
      tools: METADATA.tools,
    });
    expect(renderCurlJsonRpcSnippet(other)).toContain(
      "https://a-different-deploy.vercel.app/api/mcp",
    );
  });
});
