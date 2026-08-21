import { Agent } from "@mastra/core/agent";
import type { EnvSource } from "./config.js";
import type { ChatModel } from "./model-provider.js";
import { createChatModel } from "./model-provider.js";

const AGENT_ID = "interview-agent";
const AGENT_NAME = "Interview Agent";

/**
 * Placeholder instructions only — voice, gap discipline, and grounding
 * content are covered by a later task in epic #5 (v0.5 Interview Chat
 * Agent). This task wires the runtime, not the prompt.
 */
const PLACEHOLDER_INSTRUCTIONS =
  "You are an interview assistant answering questions about a candidate's " +
  "background. Detailed voice, grounding tools, and gap-handling rules will " +
  "be added in a later task.";

/** Options for {@link getInterviewAgent}. */
export interface GetInterviewAgentOptions {
  /**
   * Inject a stub/mock AI SDK `LanguageModel` — used by tests to produce a
   * response with zero real model calls. When omitted, the model is
   * resolved from the environment via `createChatModel()`.
   */
  model?: ChatModel;
  /** Env source forwarded to `createChatModel()` when `model` is not given. */
  env?: EnvSource;
}

/**
 * The stable public entry point of this package: build the embedded
 * interview Mastra `Agent`. No tools yet (domain-tools task), no HTTP
 * surface (chat API route task) — just an agent bound to a provider-agnostic
 * model, ready for a stubbed or real call.
 */
export function getInterviewAgent(options: GetInterviewAgentOptions = {}): Agent {
  const model = options.model ?? createChatModel({ env: options.env });

  return new Agent({
    id: AGENT_ID,
    name: AGENT_NAME,
    instructions: PLACEHOLDER_INSTRUCTIONS,
    model,
  });
}
