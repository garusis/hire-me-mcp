import { describe, expect, it } from "vitest";
import { computeChunkId, computeContentHash } from "./hash.js";
import { normalizeText } from "./text.js";

describe("computeChunkId", () => {
  it("is deterministic for the same triple", () => {
    expect(computeChunkId("experience", "acme-role", 0)).toBe(
      computeChunkId("experience", "acme-role", 0),
    );
  });

  it("differs when any part of the triple differs", () => {
    const base = computeChunkId("experience", "acme-role", 0);
    expect(computeChunkId("project", "acme-role", 0)).not.toBe(base);
    expect(computeChunkId("experience", "other-role", 0)).not.toBe(base);
    expect(computeChunkId("experience", "acme-role", 1)).not.toBe(base);
  });

  it("returns a hex string", () => {
    expect(computeChunkId("experience", "acme-role", 0)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("computeContentHash", () => {
  it("is deterministic for the same normalized text", () => {
    const text = normalizeText("Some career prose.");
    expect(computeContentHash(text)).toBe(computeContentHash(text));
  });

  it("differs for different text", () => {
    expect(computeContentHash("a")).not.toBe(computeContentHash("b"));
  });

  it("is stable across whitespace-only source edits once normalized", () => {
    const a = normalizeText("Line one.\n\nLine two has content.");
    const b = normalizeText("Line one.   \n\n\n\nLine two   has content.  ");
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("returns a hex string", () => {
    expect(computeContentHash("hello")).toMatch(/^[0-9a-f]+$/);
  });
});
