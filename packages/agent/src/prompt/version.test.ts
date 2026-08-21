import { describe, expect, it } from "vitest";
import type { PromptSection } from "./sections.js";
import { PROMPT_SECTIONS } from "./sections.js";
import { computePromptVersion, PROMPT_VERSION } from "./version.js";

const BASE_SECTIONS: readonly PromptSection[] = [
  { id: "identity", title: "Identity", body: "Original body." },
];

describe("computePromptVersion", () => {
  it("is deterministic for the same section content", () => {
    expect(computePromptVersion(BASE_SECTIONS)).toBe(computePromptVersion(BASE_SECTIONS));
  });

  it("changes when a section's body content changes", () => {
    const edited: readonly PromptSection[] = [
      { id: "identity", title: "Identity", body: "Edited body." },
    ];
    expect(computePromptVersion(edited)).not.toBe(computePromptVersion(BASE_SECTIONS));
  });

  it("changes when a section's title changes, body held constant", () => {
    const edited: readonly PromptSection[] = [
      { id: "identity", title: "Renamed", body: "Original body." },
    ];
    expect(computePromptVersion(edited)).not.toBe(computePromptVersion(BASE_SECTIONS));
  });

  it("changes when section order changes", () => {
    const a: readonly PromptSection[] = [
      { id: "identity", title: "Identity", body: "A." },
      { id: "voice", title: "Voice", body: "B." },
    ];
    const b: readonly PromptSection[] = [
      { id: "voice", title: "Voice", body: "B." },
      { id: "identity", title: "Identity", body: "A." },
    ];
    expect(computePromptVersion(a)).not.toBe(computePromptVersion(b));
  });

  it("does not change when content is identical (no spurious drift)", () => {
    expect(computePromptVersion(PROMPT_SECTIONS)).toBe(computePromptVersion(PROMPT_SECTIONS));
  });

  it("returns a short, stable-shape hex fingerprint", () => {
    expect(computePromptVersion(BASE_SECTIONS)).toMatch(/^[0-9a-f]{8,64}$/);
  });
});

describe("PROMPT_VERSION", () => {
  it("is the version computed from the real, exported PROMPT_SECTIONS", () => {
    expect(PROMPT_VERSION).toBe(computePromptVersion(PROMPT_SECTIONS));
  });
});
