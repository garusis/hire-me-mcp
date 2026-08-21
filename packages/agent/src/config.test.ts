import { describe, expect, it } from "vitest";
import { InvalidChatProviderError, MissingEnvVarError, resolveChatModelConfig } from "./config.js";

describe("resolveChatModelConfig", () => {
  it("defaults to the google provider with the Gemini free-tier flash model id", () => {
    const config = resolveChatModelConfig({
      GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key",
    });

    expect(config).toEqual({
      provider: "google",
      modelId: "gemini-3.6-flash",
      apiKey: "fake-google-key",
    });
  });

  it("allows CHAT_MODEL_ID to override the default google model id", () => {
    const config = resolveChatModelConfig({
      GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key",
      CHAT_MODEL_ID: "gemini-3.5-flash-lite",
    });

    expect(config.modelId).toBe("gemini-3.5-flash-lite");
  });

  it("resolves the anthropic binding when CHAT_PROVIDER=anthropic, using a fake key with no network call", () => {
    const config = resolveChatModelConfig({
      CHAT_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "fake-anthropic-key",
    });

    expect(config).toEqual({
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
      apiKey: "fake-anthropic-key",
    });
  });

  it("allows CHAT_MODEL_ID to override the default anthropic model id", () => {
    const config = resolveChatModelConfig({
      CHAT_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "fake-anthropic-key",
      CHAT_MODEL_ID: "claude-haiku-4-5-20251001",
    });

    expect(config.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("throws MissingEnvVarError naming GOOGLE_GENERATIVE_AI_API_KEY when the google key is absent", () => {
    expect(() => resolveChatModelConfig({})).toThrow(MissingEnvVarError);
    try {
      resolveChatModelConfig({});
      throw new Error("expected resolveChatModelConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvVarError);
      expect((error as MissingEnvVarError).variableName).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
      expect((error as Error).message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    }
  });

  it("throws MissingEnvVarError naming ANTHROPIC_API_KEY when the anthropic provider is selected without a key", () => {
    try {
      resolveChatModelConfig({ CHAT_PROVIDER: "anthropic" });
      throw new Error("expected resolveChatModelConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvVarError);
      expect((error as MissingEnvVarError).variableName).toBe("ANTHROPIC_API_KEY");
    }
  });

  it("throws InvalidChatProviderError for an unrecognized CHAT_PROVIDER value", () => {
    expect(() => resolveChatModelConfig({ CHAT_PROVIDER: "openai" })).toThrow(
      InvalidChatProviderError,
    );
  });

  it("never includes an injected API key value in a thrown error's message", () => {
    const secret = "sk-super-secret-value-should-not-leak";
    try {
      resolveChatModelConfig({
        CHAT_PROVIDER: "openai",
        GOOGLE_GENERATIVE_AI_API_KEY: secret,
        ANTHROPIC_API_KEY: secret,
      });
      throw new Error("expected resolveChatModelConfig to throw");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
