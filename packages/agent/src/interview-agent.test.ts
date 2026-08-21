import { Agent } from "@mastra/core/agent";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { MissingEnvVarError } from "./config.js";
import { getInterviewAgent } from "./interview-agent.js";
import { PROMPT_SECTIONS, SYSTEM_PROMPT } from "./prompt/index.js";

function stubModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("getInterviewAgent", () => {
  it("returns a Mastra Agent instance", () => {
    const agent = getInterviewAgent({ model: stubModel("hi") });
    expect(agent).toBeInstanceOf(Agent);
  });

  it("produces a response against a stubbed model, with zero real model calls", async () => {
    const agent = getInterviewAgent({ model: stubModel("Hello from the stub model.") });

    const result = await agent.generate("Hello, agent!");

    expect(result.text).toBe("Hello from the stub model.");
  });

  it("falls back to the env-driven createChatModel() factory when no model override is given", () => {
    expect(() => getInterviewAgent({ env: {} })).toThrow(MissingEnvVarError);
  });

  it("wires the real, versioned system prompt as its instructions — not a placeholder", async () => {
    const agent = getInterviewAgent({ model: stubModel("hi") });

    const instructions = await agent.getInstructions();

    expect(instructions).toBe(SYSTEM_PROMPT);
    for (const section of PROMPT_SECTIONS) {
      expect(instructions).toContain(section.body);
    }
  });
});
