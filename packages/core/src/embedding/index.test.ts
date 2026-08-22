import { describe, expect, it } from "vitest";
import {
  createEmbeddingClient,
  createGoogleEmbeddingClient,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_ID,
  EMBEDDING_PROVIDER,
  EmbeddingFailureError,
  loadEmbeddingApiKey,
  MissingEmbeddingApiKeyError,
} from "./index.js";

describe("embedding module entry point", () => {
  it("re-exports the config and client surface together", () => {
    expect(EMBEDDING_MODEL_ID).toBe("gemini-embedding-001");
    expect(EMBEDDING_PROVIDER).toBe("google");
    expect(EMBEDDING_DIMENSION).toBe(768);
    expect(typeof createEmbeddingClient).toBe("function");
    expect(typeof createGoogleEmbeddingClient).toBe("function");
    expect(new EmbeddingFailureError("x")).toBeInstanceOf(Error);
  });

  it("re-exports the api key loader", () => {
    expect(typeof loadEmbeddingApiKey).toBe("function");
    expect(new MissingEmbeddingApiKeyError()).toBeInstanceOf(Error);
  });
});
