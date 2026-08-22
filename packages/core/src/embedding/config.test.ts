import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_PROVIDER } from "./config.js";

describe("embedding config", () => {
  it("pins the Google gemini-embedding-001 model id", () => {
    expect(EMBEDDING_MODEL_ID).toBe("gemini-embedding-001");
  });

  it("pins the provider to google", () => {
    expect(EMBEDDING_PROVIDER).toBe("google");
  });

  it("matches the vector(N) column dimension from the #14 migration", () => {
    expect(EMBEDDING_DIMENSION).toBe(768);
  });
});
