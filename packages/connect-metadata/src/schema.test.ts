import { describe, expect, it } from "vitest";
import { clientIdSchema, connectionMetadataSchema, toolInfoSchema } from "./schema";

const VALID_TOOL = {
  name: "get-profile",
  description: "Returns the profile record.",
  examplePrompt: "Who is Marcos Alvarez?",
};

const VALID_METADATA = {
  serverName: "hire-me-mcp",
  description: "A public MCP server over Marcos Alvarez's career data.",
  endpointUrl: "https://hire-me-mcp-web.vercel.app/api/mcp",
  transport: "streamable-http",
  auth: "none",
  tools: [VALID_TOOL],
  examplePrompts: [
    "Who is Marcos Alvarez?",
    "What has he worked on since 2022?",
    "Has he worked with event-driven architectures?",
  ],
};

describe("toolInfoSchema", () => {
  it("accepts a tool with a non-empty name, description, and example prompt", () => {
    expect(toolInfoSchema.parse(VALID_TOOL)).toEqual(VALID_TOOL);
  });

  it("rejects a tool with an empty name", () => {
    expect(() => toolInfoSchema.parse({ ...VALID_TOOL, name: "" })).toThrow();
  });
});

describe("clientIdSchema", () => {
  it("accepts every known client id", () => {
    for (const id of [
      "claude-web-desktop",
      "claude-code",
      "claude-desktop-json",
      "vscode-cursor",
      "curl-jsonrpc",
      "generic",
    ]) {
      expect(clientIdSchema.parse(id)).toBe(id);
    }
  });

  it("rejects an unknown client id", () => {
    expect(() => clientIdSchema.parse("not-a-real-client")).toThrow();
  });
});

describe("connectionMetadataSchema", () => {
  it("accepts a fully valid connection metadata object", () => {
    expect(connectionMetadataSchema.parse(VALID_METADATA)).toEqual(VALID_METADATA);
  });

  it("rejects a non-URL endpointUrl", () => {
    expect(() =>
      connectionMetadataSchema.parse({ ...VALID_METADATA, endpointUrl: "not-a-url" }),
    ).toThrow();
  });

  it("rejects an empty tools array — the server always registers at least one tool", () => {
    expect(() => connectionMetadataSchema.parse({ ...VALID_METADATA, tools: [] })).toThrow();
  });

  it("rejects fewer than 3 example prompts", () => {
    expect(() =>
      connectionMetadataSchema.parse({ ...VALID_METADATA, examplePrompts: ["only one"] }),
    ).toThrow();
  });

  it("rejects more than 5 example prompts", () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => `prompt ${i}`);
    expect(() =>
      connectionMetadataSchema.parse({ ...VALID_METADATA, examplePrompts: tooMany }),
    ).toThrow();
  });

  it("rejects a transport other than streamable-http", () => {
    expect(() => connectionMetadataSchema.parse({ ...VALID_METADATA, transport: "sse" })).toThrow();
  });

  it("rejects an auth model other than none", () => {
    expect(() => connectionMetadataSchema.parse({ ...VALID_METADATA, auth: "oauth" })).toThrow();
  });
});
