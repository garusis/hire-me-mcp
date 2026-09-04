import { describe, expect, it } from "vitest";
import { InvalidEmbedPacingError, loadEmbedMaxTextsPerMinute } from "./pacing-env.js";

describe("loadEmbedMaxTextsPerMinute", () => {
  it("defaults to 80 when EMBED_MAX_TEXTS_PER_MINUTE is unset", () => {
    expect(loadEmbedMaxTextsPerMinute({})).toBe(80);
  });

  it("parses a positive integer value", () => {
    expect(loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "40" })).toBe(40);
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "  120  " })).toBe(120);
  });

  it("throws InvalidEmbedPacingError for a non-numeric value", () => {
    expect(() => loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "off" })).toThrow(
      InvalidEmbedPacingError,
    );
  });

  it("throws InvalidEmbedPacingError for zero", () => {
    expect(() => loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "0" })).toThrow(
      InvalidEmbedPacingError,
    );
  });

  it("throws InvalidEmbedPacingError for a negative value", () => {
    expect(() => loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "-5" })).toThrow(
      InvalidEmbedPacingError,
    );
  });

  it("throws InvalidEmbedPacingError for a non-integer value", () => {
    expect(() => loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "12.5" })).toThrow(
      InvalidEmbedPacingError,
    );
  });

  it("the error message names the env var and the invalid value", () => {
    try {
      loadEmbedMaxTextsPerMinute({ EMBED_MAX_TEXTS_PER_MINUTE: "off" });
      throw new Error("expected loadEmbedMaxTextsPerMinute to throw");
    } catch (error) {
      expect((error as Error).message).toMatch(/EMBED_MAX_TEXTS_PER_MINUTE/);
      expect((error as Error).message).toMatch(/off/);
    }
  });
});
