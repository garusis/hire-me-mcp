import { describe, expect, it, vi } from "vitest";
import { createEmbeddingClient, EmbeddingFailureError } from "./client.js";

function fakeVector(seed: number): number[] {
  return Array.from({ length: 8 }, (_, index) => seed + index);
}

describe("createEmbeddingClient", () => {
  it("batches inputs and preserves deterministic ordering across batches", async () => {
    const calls: string[][] = [];
    const embedBatch = vi.fn(async (batch: readonly string[]) => {
      calls.push([...batch]);
      return batch.map((_, index) => fakeVector(calls.length * 100 + index));
    });

    const client = createEmbeddingClient({ embedBatch, batchSize: 2, sleep: async () => {} });
    const result = await client.embed(["a", "b", "c", "d", "e"]);

    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(result).toHaveLength(5);
    expect(embedBatch).toHaveBeenCalledTimes(3);
  });

  it("returns an empty array and makes zero calls for empty input", async () => {
    const embedBatch = vi.fn(async () => []);
    const client = createEmbeddingClient({ embedBatch, sleep: async () => {} });

    const result = await client.embed([]);

    expect(result).toEqual([]);
    expect(embedBatch).not.toHaveBeenCalled();
  });

  it("retries a batch on a retryable (429) failure and eventually succeeds", async () => {
    let attempt = 0;
    const embedBatch = vi.fn(async (batch: readonly string[]) => {
      attempt += 1;
      if (attempt < 3) {
        throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      }
      return batch.map((_, index) => fakeVector(index));
    });
    const sleep = vi.fn(async () => {});

    const client = createEmbeddingClient({
      embedBatch,
      maxRetries: 5,
      initialDelayMs: 10,
      sleep,
    });
    const result = await client.embed(["only"]);

    expect(result).toHaveLength(1);
    expect(embedBatch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // Exponential backoff: second delay is larger than the first.
    const firstDelay = sleep.mock.calls.at(0)?.at(0) as number | undefined;
    const secondDelay = sleep.mock.calls.at(1)?.at(0) as number | undefined;
    expect(secondDelay).toBeGreaterThan(firstDelay ?? 0);
  });

  it("retries on a 5xx transient failure", async () => {
    let attempt = 0;
    const embedBatch = vi.fn(async (batch: readonly string[]) => {
      attempt += 1;
      if (attempt < 2) {
        throw Object.assign(new Error("server error"), { statusCode: 503 });
      }
      return batch.map((_, index) => fakeVector(index));
    });

    const client = createEmbeddingClient({
      embedBatch,
      maxRetries: 3,
      initialDelayMs: 1,
      sleep: async () => {},
    });
    const result = await client.embed(["x"]);

    expect(result).toHaveLength(1);
    expect(embedBatch).toHaveBeenCalledTimes(2);
  });

  it("aborts with EmbeddingFailureError after exhausting retries on a permanent failure", async () => {
    const embedBatch = vi.fn(async () => {
      throw Object.assign(new Error("rate limited forever"), { statusCode: 429 });
    });

    const client = createEmbeddingClient({
      embedBatch,
      maxRetries: 2,
      initialDelayMs: 1,
      sleep: async () => {},
    });

    await expect(client.embed(["x"])).rejects.toThrow(EmbeddingFailureError);
    // 1 initial attempt + 2 retries = 3 calls.
    expect(embedBatch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable (400) failure and aborts immediately", async () => {
    const embedBatch = vi.fn(async () => {
      throw Object.assign(new Error("bad request"), { statusCode: 400 });
    });

    const client = createEmbeddingClient({
      embedBatch,
      maxRetries: 5,
      initialDelayMs: 1,
      sleep: async () => {},
    });

    await expect(client.embed(["x"])).rejects.toThrow(EmbeddingFailureError);
    expect(embedBatch).toHaveBeenCalledTimes(1);
  });

  it("throws when a batch returns a different number of embeddings than inputs", async () => {
    const embedBatch = vi.fn(async () => [fakeVector(0)]);

    const client = createEmbeddingClient({ embedBatch, sleep: async () => {} });

    await expect(client.embed(["a", "b"])).rejects.toThrow(EmbeddingFailureError);
  });
});
