import type { Locator } from "@playwright/test";

/**
 * Reading a streamed chat answer back out of the rendered panel.
 *
 * Since issue 227 the chat renders a `[cite:...]` marker as a numbered
 * superscript link rather than printing the raw marker into the sentence —
 * machine syntax has no business in prose a recruiter reads. The marker
 * itself is preserved on the link's `data-citation` attribute, which is what
 * these helpers read, so the preview specs can still check citation coverage
 * (and can still hand text to `@hire-me-mcp/agent/citations`'s
 * `parseCitations`, the shared definition of the marker format) without
 * depending on the UI showing that syntax to a human.
 */

/** The answer prose itself — not the role label, tool-step line, Sources list or attached error. */
export const CHAT_ANSWER_SELECTOR = "[data-chat-answer]";

/** One inline citation reference inside a rendered answer. */
export const CITATION_LINK_SELECTOR = "[data-citation]";

/** One entry in a message's "Sources" list. */
export const CITATION_SOURCE_SELECTOR = "[data-citation-source]";

/** The answer paragraph of a chat message bubble. */
export function answerParagraph(message: Locator): Locator {
  return message.locator(CHAT_ANSWER_SELECTOR);
}

/**
 * The answer's text with every inline citation reference expanded back to
 * its `[cite:...]` marker — the model's own answer, in the shape the shared
 * citation parser expects.
 */
export async function readAnswerWithMarkers(message: Locator): Promise<string> {
  return answerParagraph(message).evaluate((element, citationSelector) => {
    const clone = element.cloneNode(true) as HTMLElement;
    for (const citation of clone.querySelectorAll(citationSelector)) {
      const marker = citation.getAttribute("data-citation") ?? "";
      citation.replaceWith(document.createTextNode(` ${marker}`));
    }
    return (clone.textContent ?? "").trim();
  }, CITATION_LINK_SELECTOR);
}

/** Just the visible prose a visitor actually reads — reference numbers included, marker syntax not. */
export async function readVisibleAnswer(message: Locator): Promise<string> {
  return (await answerParagraph(message).innerText()).trim();
}
