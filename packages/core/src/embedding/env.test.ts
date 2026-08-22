import { describe, expect, it } from "vitest";
import { loadEmbeddingApiKey, MissingEmbeddingApiKeyError } from "./env.js";

describe("loadEmbeddingApiKey", () => {
  it("returns the trimmed GOOGLE_GENERATIVE_AI_API_KEY", () => {
    expect(loadEmbeddingApiKey({ GOOGLE_GENERATIVE_AI_API_KEY: "  test-key  " })).toBe("test-key");
  });

  it("throws MissingEmbeddingApiKeyError when unset", () => {
    expect(() => loadEmbeddingApiKey({})).toThrow(MissingEmbeddingApiKeyError);
  });

  it("throws MissingEmbeddingApiKeyError when blank", () => {
    expect(() => loadEmbeddingApiKey({ GOOGLE_GENERATIVE_AI_API_KEY: "   " })).toThrow(
      MissingEmbeddingApiKeyError,
    );
  });

  it("the error message names the env var but never a value", () => {
    try {
      loadEmbeddingApiKey({});
      throw new Error("expected loadEmbeddingApiKey to throw");
    } catch (error) {
      expect((error as Error).message).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/);
    }
  });
});
