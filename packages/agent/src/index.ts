/**
 * Embedded Mastra interview agent runtime.
 *
 * Consumed in-process by `apps/web` route handlers (Node runtime) — see
 * README.md for the embedded-not-a-service rationale and how to swap the
 * chat model provider.
 */

export type { ChatModelConfig, ChatProvider, EnvSource } from "./config.js";
export { InvalidChatProviderError, MissingEnvVarError, resolveChatModelConfig } from "./config.js";
export type { GetInterviewAgentOptions } from "./interview-agent.js";
export { getInterviewAgent } from "./interview-agent.js";
export type { ChatModel, CreateChatModelOptions } from "./model-provider.js";
export { createChatModel } from "./model-provider.js";
