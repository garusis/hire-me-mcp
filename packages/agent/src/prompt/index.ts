/**
 * Composable, versioned system prompt for the interview agent.
 *
 * `SYSTEM_PROMPT` is the ready-to-use string `getInterviewAgent()` (see
 * `../interview-agent.ts`) passes as the Mastra `Agent`'s `instructions`.
 * `PROMPT_SECTIONS`/`composeSystemPrompt`/`PROMPT_VERSION` are exported
 * separately so evals (#72) can compose alternate section sets and attribute
 * results to the exact content that produced them.
 */
import { composeSystemPrompt } from "./compose.js";
import { PROMPT_SECTIONS } from "./sections.js";

export { composeSystemPrompt } from "./compose.js";
export type { PromptSection, PromptSectionId } from "./sections.js";
export { PROMPT_SECTION_ORDER, PROMPT_SECTIONS } from "./sections.js";
export { computePromptVersion, PROMPT_VERSION } from "./version.js";

/** The fully composed system prompt, built from the real, shipped `PROMPT_SECTIONS`. */
export const SYSTEM_PROMPT: string = composeSystemPrompt(PROMPT_SECTIONS);
