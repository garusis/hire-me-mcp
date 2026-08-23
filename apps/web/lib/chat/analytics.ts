/**
 * Chat-pipeline-specific analytics helpers (#79). The only non-trivial
 * logic here is extracting "the question this turn asked" from the
 * request's message list, purely so it can be classified into a theme —
 * the raw text is never returned from this module, only fed straight into
 * `classifyQuestionTheme` and discarded.
 */

import { classifyQuestionTheme, type QuestionTheme } from "@hire-me-mcp/core/analytics";

/** The minimal shape this module reads off a chat request message — matches `ChatRequestBody["messages"]`'s element type. */
interface ChatMessageLike {
  role: string;
  parts: ReadonlyArray<{ type: string; text?: string }>;
}

/**
 * Classifies the theme of the most recent `role: "user"` message in
 * `messages` — the question this turn is actually asking, ignoring older
 * history. Multiple text parts on that message are joined before
 * classification. Returns `"other"` when there is no user message at all
 * (shouldn't happen for a validated request, but this function never
 * throws either way).
 */
export function classifyLastUserQuestionTheme(messages: readonly ChatMessageLike[]): QuestionTheme {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join(" ");
    return classifyQuestionTheme(text);
  }
  return "other";
}
