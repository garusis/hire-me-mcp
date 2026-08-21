import { describe, expect, it } from "vitest";
import { composeSystemPrompt, PROMPT_SECTIONS, PROMPT_VERSION, SYSTEM_PROMPT } from "./index.js";

describe("prompt module public surface", () => {
  it("re-exports PROMPT_SECTIONS, PROMPT_VERSION, composeSystemPrompt, and SYSTEM_PROMPT", () => {
    expect(PROMPT_SECTIONS.length).toBeGreaterThan(0);
    expect(typeof PROMPT_VERSION).toBe("string");
    expect(typeof composeSystemPrompt).toBe("function");
    expect(typeof SYSTEM_PROMPT).toBe("string");
  });

  it("SYSTEM_PROMPT is composeSystemPrompt() applied to the real PROMPT_SECTIONS", () => {
    expect(SYSTEM_PROMPT).toBe(composeSystemPrompt(PROMPT_SECTIONS));
  });

  it("golden snapshot: the fully composed system prompt", () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });

  it("golden snapshot: the prompt version identifier", () => {
    expect(PROMPT_VERSION).toMatchSnapshot();
  });
});
