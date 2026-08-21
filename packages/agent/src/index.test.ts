import { Agent } from "@mastra/core/agent";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_CORE_FUNCTIONS,
  AGENT_TOOL_NAMES,
  AGENT_TOOLS,
  createChatModel,
  getInterviewAgent,
  InvalidChatProviderError,
  MissingEnvVarError,
  PROMPT_SECTIONS,
  PROMPT_VERSION,
  parseCitationMarker,
  parseCitations,
  resolveChatModelConfig,
  SYSTEM_PROMPT,
  serializeCitation,
} from "./index.js";

describe("public entry point", () => {
  it("re-exports resolveChatModelConfig, resolving the google default from an injected env", () => {
    const config = resolveChatModelConfig({ GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key" });
    expect(config.provider).toBe("google");
  });

  it("re-exports createChatModel, building a model without a network call", () => {
    const model = createChatModel({ env: { GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key" } }) as {
      modelId: string;
    };
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
  });

  it("re-exports getInterviewAgent, producing a Mastra Agent that responds via a stubbed model", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "stubbed" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    });

    const agent = getInterviewAgent({ model });
    expect(agent).toBeInstanceOf(Agent);
    const result = await agent.generate("hi");
    expect(result.text).toBe("stubbed");
  });

  it("re-exports the error classes used for fail-fast config validation", () => {
    expect(() => resolveChatModelConfig({})).toThrow(MissingEnvVarError);
    expect(() => resolveChatModelConfig({ CHAT_PROVIDER: "bogus" })).toThrow(
      InvalidChatProviderError,
    );
  });

  it("re-exports the versioned system prompt: SYSTEM_PROMPT, PROMPT_SECTIONS, PROMPT_VERSION", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(PROMPT_SECTIONS.length).toBeGreaterThan(0);
    expect(PROMPT_VERSION).toMatch(/^[0-9a-f]+$/);
  });

  it("re-exports the shared citation marker parser/serializer for the UI and evals to consume", () => {
    const marker = serializeCitation({ entityType: "project", entityId: "cowork" });
    expect(parseCitationMarker(marker)).toEqual({ entityType: "project", entityId: "cowork" });
    expect(parseCitations(`see ${marker} for details`)).toEqual([
      { entityType: "project", entityId: "cowork" },
    ]);
  });

  it("re-exports the domain-grounded tool registry (#64)", () => {
    expect(AGENT_TOOL_NAMES).toEqual([
      "get-profile",
      "get-experience",
      "search-projects",
      "get-skill-evidence",
    ]);
    expect(Object.keys(AGENT_TOOLS)).toEqual(AGENT_TOOL_NAMES);
    expect(Object.keys(AGENT_TOOL_CORE_FUNCTIONS).sort()).toEqual([...AGENT_TOOL_NAMES].sort());
  });
});
