import { describe, expect, it } from "vitest";
import { MissingEnvVarError } from "./config.js";
import { createChatModel } from "./model-provider.js";

/**
 * `createChatModel` is typed against Mastra's `MastraModelConfig` union (see
 * `model-provider.ts`), so tests narrow the runtime AI SDK provider instance
 * to read its `modelId`/`provider` fields — both present on every model the
 * factory actually returns.
 */
interface InstalledLanguageModel {
  modelId: string;
  provider: string;
}

describe("createChatModel", () => {
  it("returns a google Gemini model by default, without any network call", () => {
    const model = createChatModel({
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key" },
    }) as InstalledLanguageModel;

    expect(model.modelId).toBe("gemini-3.5-flash-lite");
    expect(model.provider).toContain("google");
  });

  it("returns an anthropic model when CHAT_PROVIDER=anthropic, using a fake key with no network call", () => {
    const model = createChatModel({
      env: {
        CHAT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "fake-anthropic-key",
      },
    }) as InstalledLanguageModel;

    expect(model.modelId).toBe("claude-haiku-4-5");
    expect(model.provider).toContain("anthropic");
  });

  it("propagates MissingEnvVarError from config resolution when the selected provider's key is absent", () => {
    expect(() => createChatModel({ env: {} })).toThrow(MissingEnvVarError);
  });
});
