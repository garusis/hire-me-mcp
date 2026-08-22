import { describe, expect, it, vi } from "vitest";

const embedMany = vi.fn();
const embeddingModel = vi.fn((modelId: string) => ({ modelId }));
const createGoogleGenerativeAI = vi.fn((..._args: unknown[]) => ({ embedding: embeddingModel }));

vi.mock("ai", () => ({ embedMany: (...args: unknown[]) => embedMany(...args) }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (...args: unknown[]) => createGoogleGenerativeAI(...args),
}));

describe("createGoogleEmbeddingClient", () => {
  it("calls embedMany with the configured model, dimension, and input batch", async () => {
    embedMany.mockResolvedValueOnce({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    });
    const { createGoogleEmbeddingClient } = await import("./google-client.js");

    const client = createGoogleEmbeddingClient({ apiKey: "test-key" });
    const result = await client.embed(["hello", "world"]);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(embeddingModel).toHaveBeenCalledWith("gemini-embedding-001");
    expect(embedMany).toHaveBeenCalledWith(
      expect.objectContaining({
        values: ["hello", "world"],
        providerOptions: { google: { outputDimensionality: 768 } },
      }),
    );
  });

  it("honors an explicit modelId override", async () => {
    embedMany.mockResolvedValueOnce({ embeddings: [[0.1]] });
    const { createGoogleEmbeddingClient } = await import("./google-client.js");

    const client = createGoogleEmbeddingClient({ apiKey: "test-key", modelId: "custom-model" });
    await client.embed(["x"]);

    expect(embeddingModel).toHaveBeenCalledWith("custom-model");
  });
});
