/**
 * Embedded Mastra interview agent runtime.
 *
 * Consumed in-process by `apps/web` route handlers (Node runtime) — see
 * README.md for the embedded-not-a-service rationale and how to swap the
 * chat model provider.
 */

export type { CitableEntityType, CitationMarker, CitationSpan } from "./citations.js";
export {
  parseCitationMarker,
  parseCitationSpans,
  parseCitations,
  serializeCitation,
} from "./citations.js";
export type { ChatModelConfig, ChatProvider, EnvSource } from "./config.js";
export { InvalidChatProviderError, MissingEnvVarError, resolveChatModelConfig } from "./config.js";
export type { GetInterviewAgentOptions } from "./interview-agent.js";
export { getInterviewAgent } from "./interview-agent.js";
export type { ChatModel, CreateChatModelOptions } from "./model-provider.js";
export { createChatModel } from "./model-provider.js";
export type { PromptSection, PromptSectionId } from "./prompt/index.js";
export {
  composeSystemPrompt,
  computePromptVersion,
  PROMPT_SECTION_ORDER,
  PROMPT_SECTIONS,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./prompt/index.js";
export { AGENT_TOOL_CORE_FUNCTIONS, AGENT_TOOL_NAMES, AGENT_TOOLS } from "./tools/index.js";
