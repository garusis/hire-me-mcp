import type { PromptSection } from "./sections.js";
import { PROMPT_SECTIONS } from "./sections.js";

/**
 * Deterministically compose named prompt sections into the single system
 * prompt string passed to the model. Pure function of its input — no
 * randomness, no clock, no environment reads — so the same sections always
 * produce byte-identical output (required for the golden snapshot test and
 * for the version identifier in `./version.ts` to be meaningful).
 */
export function composeSystemPrompt(sections: readonly PromptSection[] = PROMPT_SECTIONS): string {
  return sections.map((section) => `## ${section.title}\n\n${section.body}`).join("\n\n");
}
