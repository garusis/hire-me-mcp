import { Agent } from "@mastra/core/agent";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  createChatModel,
  getInterviewAgent,
  InvalidChatProviderError,
  MissingEnvVarError,
  resolveChatModelConfig,
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
    expect(model.modelId).toBe("gemini-3.6-flash");
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
});
