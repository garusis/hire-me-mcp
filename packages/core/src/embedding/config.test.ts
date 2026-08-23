import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_ID,
  EMBEDDING_PROVIDER,
  STORED_EMBEDDING_MODEL_ID,
} from "./config.js";

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

  it("derives the stored embedding_model identifier from the real model id, dimension, and a task-type calibration suffix", () => {
    expect(STORED_EMBEDDING_MODEL_ID).toBe(`${EMBEDDING_MODEL_ID}/${EMBEDDING_DIMENSION}/task-v1`);
  });

  it("keeps the stored identifier distinct from the real API model id, so it never gets passed to the provider", () => {
    expect(STORED_EMBEDDING_MODEL_ID).not.toBe(EMBEDDING_MODEL_ID);
  });
});
