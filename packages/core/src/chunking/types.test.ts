import { describe, expect, it } from "vitest";
import type { Chunk, ChunkCitation, ChunkingOptions, ChunkMetadata } from "./types.js";

describe("chunking types", () => {
  it("Chunk accepts the full documented shape", () => {
    const citation: ChunkCitation = {
      entityType: "experience",
      entityId: "acme-role",
      label: "Engineer, Acme",
      fragment: "chunk-0",
      url: "https://example.com",
    };
    const metadata: ChunkMetadata = {
      company: "Acme",
      tags: ["typescript"],
      dateFrom: "2020-01",
      dateTo: "2021-01",
    };
    const chunk: Chunk = {
      id: "abc123",
      sourceType: "experience",
      sourceId: "acme-role",
      chunkIndex: 0,
      text: "some text",
      contentHash: "def456",
      tokenCount: 3,
      citation,
      metadata,
    };

    expect(chunk.id).toBe("abc123");
    expect(chunk.citation.url).toBe("https://example.com");
    expect(chunk.metadata.tags).toEqual(["typescript"]);
  });

  it("ChunkingOptions fields are all optional", () => {
    const options: ChunkingOptions = {};
    expect(options).toEqual({});
  });
});
