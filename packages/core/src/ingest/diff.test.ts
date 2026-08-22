import { describe, expect, it } from "vitest";
import type { Chunk } from "../chunking/types.js";
import type { ChunkFingerprint } from "../db/chunks-repository.js";
import { computeIngestDiff } from "./diff.js";

function makeChunk(id: string, contentHash: string): Chunk {
  return {
    id,
    sourceType: "project",
    sourceId: id,
    chunkIndex: 0,
    text: `text-${id}`,
    contentHash,
    tokenCount: 4,
    citation: { entityType: "project", entityId: id, label: id },
    metadata: {},
  };
}

function fingerprint(id: string, contentHash: string, embeddingModel: string): ChunkFingerprint {
  return { id, contentHash, embeddingModel };
}

const MODEL_ID = "gemini-embedding-001";

describe("computeIngestDiff", () => {
  it("puts every fresh chunk in toInsert when the store is empty", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("b", "hash-b")];
    const diff = computeIngestDiff(chunks, [], { modelId: MODEL_ID });

    expect(diff.toInsert.map((c) => c.id)).toEqual(["a", "b"]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("treats a chunk with a matching hash and model as unchanged", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [fingerprint("a", "hash-a", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.unchanged.map((c) => c.id)).toEqual(["a"]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("treats a chunk with a changed contentHash as toUpdate, not toInsert", () => {
    const chunks = [makeChunk("a", "hash-a-v2")];
    const existing = [fingerprint("a", "hash-a-v1", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a"]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("puts an existing id absent from the fresh chunks into toDelete", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("orphan", "hash-x", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toDelete).toEqual(["orphan"]);
  });

  it("editing a single record only re-embeds that record's chunks; siblings stay unchanged", () => {
    const chunks = [
      makeChunk("a", "hash-a"),
      makeChunk("b", "hash-b-v2"),
      makeChunk("c", "hash-c"),
    ];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("b", "hash-b-v1", MODEL_ID),
      fingerprint("c", "hash-c", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["b"]);
    expect(diff.unchanged.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("a model id mismatch treats an otherwise-unchanged chunk as toUpdate (full re-embed)", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("b", "hash-b")];
    const existing = [
      fingerprint("a", "hash-a", "old-model"),
      fingerprint("b", "hash-b", "old-model"),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a", "b"]);
    expect(diff.unchanged).toEqual([]);
  });

  it("--full forces every chunk into toUpdate/toInsert regardless of hash or model match", () => {
    const chunks = [makeChunk("a", "hash-a"), makeChunk("new", "hash-new")];
    const existing = [fingerprint("a", "hash-a", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID, full: true });

    expect(diff.toInsert.map((c) => c.id)).toEqual(["new"]);
    expect(diff.toUpdate.map((c) => c.id)).toEqual(["a"]);
    expect(diff.unchanged).toEqual([]);
  });

  it("--full still deletes orphans", () => {
    const chunks = [makeChunk("a", "hash-a")];
    const existing = [
      fingerprint("a", "hash-a", MODEL_ID),
      fingerprint("orphan", "hash-x", MODEL_ID),
    ];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID, full: true });

    expect(diff.toDelete).toEqual(["orphan"]);
  });

  it("computes toEmbed as the concatenation of toInsert and toUpdate, in that order", () => {
    const chunks = [makeChunk("a", "hash-a-v2"), makeChunk("new", "hash-new")];
    const existing = [fingerprint("a", "hash-a-v1", MODEL_ID)];
    const diff = computeIngestDiff(chunks, existing, { modelId: MODEL_ID });

    expect(diff.toEmbed.map((c) => c.id)).toEqual(["a", "new"]);
  });
});
