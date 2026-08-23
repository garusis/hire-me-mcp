import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { MastraModelConfig } from "@mastra/core/llm";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import type { ChatModelConfig, EnvSource } from "./config.js";
import { resolveChatModelConfig } from "./config.js";

/**
 * The AI SDK model instances `createChatModel` produces, typed against
 * Mastra's own `MastraModelConfig` (rather than the `ai` package's
 * `LanguageModel` union) — Mastra vendors its own snapshot of the AI SDK
 * provider types, and `MastraModelConfig` is what `Agent`'s `model` option
 * actually accepts.
 */
export type ChatModel = MastraModelConfig;

/** Options for {@link createChatModel}. Pass `env` in tests to avoid touching `process.env`. */
export interface CreateChatModelOptions {
  env?: EnvSource;
}

/**
 * Build an AI SDK `LanguageModel` for the currently configured chat provider.
 *
 * This is the single seam the rest of the agent depends on to stay
 * provider-agnostic: swapping providers is a `CHAT_PROVIDER` env change, not
 * a code change. Constructing the model performs no network call — the AI
 * SDK provider factories only build a client descriptor; the first HTTP
 * request happens on the model's first `generate`/`stream` call.
 */
export function createChatModel(options: CreateChatModelOptions = {}): ChatModel {
  const config = resolveChatModelConfig(options.env ?? process.env);
  return buildModel(config);
}

/**
 * Default provider options baked into every Google model instance (#169):
 * `gemini-3.5-flash-lite` can spend dynamic "thinking" tokens before its
 * first output token — observed adding tens of seconds per multi-step agent
 * turn on the free tier (enough to blow past Vercel's function ceiling) and
 * burning shared RPM/RPD quota on tokens nobody reads. `thinkingBudget: 0`
 * pins thinking OFF explicitly. Quality is guarded by the agent evals
 * (gap honesty / groundedness) which run in CI on any change here.
 */
export const GOOGLE_DEFAULT_PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
} as const;

function buildModel(config: ChatModelConfig): ChatModel {
  if (config.provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
    return wrapLanguageModel({
      model: google(config.modelId),
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions: GOOGLE_DEFAULT_PROVIDER_OPTIONS },
      }),
    });
  }

  const anthropic = createAnthropic({ apiKey: config.apiKey });
  return anthropic(config.modelId);
}
