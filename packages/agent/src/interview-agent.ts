import { Agent } from "@mastra/core/agent";
import type { EnvSource } from "./config.js";
import type { ChatModel } from "./model-provider.js";
import { createChatModel } from "./model-provider.js";
import { SYSTEM_PROMPT } from "./prompt/index.js";
import { AGENT_TOOLS } from "./tools/index.js";

const AGENT_ID = "interview-agent";
const AGENT_NAME = "Interview Agent";

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
 * interview Mastra `Agent`. Instructions are the versioned system prompt
 * from `./prompt/` (identity, voice, grounding rules, gap discipline,
 * citation format, off-topic/adversarial redirect policy — see
 * `PROMPT_VERSION` for the content-hash version identifier evals attribute
 * their results to), and it is grounded on the full `packages/core`
 * domain-service tool set (`./tools/index.js`, #64). No HTTP surface yet
 * (chat API route task) — just an agent bound to a provider-agnostic model,
 * its system prompt, and its tools, ready for a stubbed or real call.
 */
export function getInterviewAgent(options: GetInterviewAgentOptions = {}): Agent {
  const model = options.model ?? createChatModel({ env: options.env });

  return new Agent({
    id: AGENT_ID,
    name: AGENT_NAME,
    instructions: SYSTEM_PROMPT,
    model,
    tools: AGENT_TOOLS,
  });
}
