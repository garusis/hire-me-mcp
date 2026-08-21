import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "./compose.js";
import { PROMPT_SECTIONS } from "./sections.js";

describe("composeSystemPrompt", () => {
  it("is deterministic — composing twice yields byte-identical output", () => {
    expect(composeSystemPrompt()).toBe(composeSystemPrompt());
  });

  it("includes every section's title and body, in PROMPT_SECTIONS order", () => {
    const composed = composeSystemPrompt();
    let lastIndex = -1;
    for (const section of PROMPT_SECTIONS) {
      const titleIndex = composed.indexOf(section.title);
      const bodyIndex = composed.indexOf(section.body);
      expect(titleIndex).toBeGreaterThan(lastIndex);
      expect(bodyIndex).toBeGreaterThan(titleIndex);
      lastIndex = bodyIndex;
    }
  });

  it("accepts an explicit sections array instead of the default PROMPT_SECTIONS", () => {
    const custom = composeSystemPrompt([
      { id: "identity", title: "Custom Title", body: "Custom body." },
    ]);
    expect(custom).toContain("Custom Title");
    expect(custom).toContain("Custom body.");
    expect(custom).not.toContain(PROMPT_SECTIONS[1]?.title ?? "__unused__");
  });

  it("produces non-empty output for the default sections", () => {
    expect(composeSystemPrompt().length).toBeGreaterThan(0);
  });
});
