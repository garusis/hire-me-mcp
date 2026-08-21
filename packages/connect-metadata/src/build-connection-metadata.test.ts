import { describe, expect, it } from "vitest";
import { buildConnectionMetadata } from "./build-connection-metadata";

const TOOLS = [
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
];

describe("buildConnectionMetadata", () => {
  it("builds a validated ConnectionMetadata from server identity, endpoint, and tools", () => {
    const metadata = buildConnectionMetadata({
      serverName: "hire-me-mcp",
      description: "A public MCP server over career data.",
      endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
      tools: TOOLS,
    });

    expect(metadata.serverName).toBe("hire-me-mcp");
    expect(metadata.endpointUrl).toBe("https://hire-me-mcp-web.vercel.app/api/mcp");
    expect(metadata.transport).toBe("streamable-http");
    expect(metadata.auth).toBe("none");
    expect(metadata.tools).toEqual(TOOLS);
  });

  it("derives examplePrompts from the tools' own examplePrompt when none are given explicitly, deduplicated and capped at 5", () => {
    const manyTools = [
      ...TOOLS,
      { name: "a", description: "d", examplePrompt: "Ping the server." }, // duplicate prompt
      { name: "b", description: "d", examplePrompt: "prompt 3" },
      { name: "c", description: "d", examplePrompt: "prompt 4" },
      { name: "d", description: "d", examplePrompt: "prompt 5" },
      { name: "e", description: "d", examplePrompt: "prompt 6" },
    ];
    const metadata = buildConnectionMetadata({
      serverName: "hire-me-mcp",
      description: "A public MCP server over career data.",
      endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
      tools: manyTools,
    });

    expect(metadata.examplePrompts.length).toBeLessThanOrEqual(5);
    expect(new Set(metadata.examplePrompts).size).toBe(metadata.examplePrompts.length);
  });

  it("uses explicit examplePrompts when given, instead of deriving them from tools", () => {
    const explicit = ["one", "two", "three"];
    const metadata = buildConnectionMetadata({
      serverName: "hire-me-mcp",
      description: "A public MCP server over career data.",
      endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
      tools: TOOLS,
      examplePrompts: explicit,
    });

    expect(metadata.examplePrompts).toEqual(explicit);
  });

  it("throws (fails loud) rather than returning an invalid object when given an empty tools array", () => {
    expect(() =>
      buildConnectionMetadata({
        serverName: "hire-me-mcp",
        description: "A public MCP server over career data.",
        endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
        tools: [],
      }),
    ).toThrow();
  });

  it("throws when the endpoint URL is not a valid URL", () => {
    expect(() =>
      buildConnectionMetadata({
        serverName: "hire-me-mcp",
        description: "A public MCP server over career data.",
        endpointUrl: "not-a-url",
        tools: TOOLS,
      }),
    ).toThrow();
  });
});
