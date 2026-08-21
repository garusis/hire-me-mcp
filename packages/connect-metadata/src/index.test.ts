import { describe, expect, it } from "vitest";
import {
  buildClientSnippets,
  buildConnectionMetadata,
  checkGeneratedRegions,
  clientIdSchema,
  connectionMetadataSchema,
  injectGeneratedRegions,
  MalformedMarkerError,
  MarkerNotFoundError,
  renderClaudeCodeSnippet,
  renderCurlJsonRpcSnippet,
  renderMcpServersJson,
  toolInfoSchema,
} from "./index.js";

describe("package barrel (./index.ts)", () => {
  it("re-exports the same buildConnectionMetadata used to construct a working pipeline end to end", () => {
    const metadata = buildConnectionMetadata({
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

    expect(connectionMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(clientIdSchema.parse("claude-code")).toBe("claude-code");
    expect(toolInfoSchema.parse(metadata.tools[0])).toEqual(metadata.tools[0]);

    expect(renderClaudeCodeSnippet(metadata)).toContain("claude mcp add");
    expect(() => JSON.parse(renderMcpServersJson(metadata))).not.toThrow();
    expect(renderCurlJsonRpcSnippet(metadata)).toContain("curl");

    const snippets = buildClientSnippets(metadata);
    expect(snippets.length).toBeGreaterThan(0);

    const rendered = "<!-- BEGIN GENERATED: x -->old<!-- END GENERATED: x -->";
    const injected = injectGeneratedRegions(rendered, [{ id: "x", content: "new" }]);
    expect(injected).toContain("new");
    expect(checkGeneratedRegions(injected, [{ id: "x", content: "new" }]).drifted).toEqual([]);
    expect(MalformedMarkerError).toBeDefined();
    expect(MarkerNotFoundError).toBeDefined();
  });
});
