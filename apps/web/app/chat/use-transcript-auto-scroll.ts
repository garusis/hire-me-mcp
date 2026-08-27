"use client";

/**
 * Keeps the chat transcript following the conversation (issue 271).
 *
 * ## The defect
 *
 * The transcript is a fixed-height `overflow-y: auto` container. From the
 * second question onward it is taller than its box, and nothing ever moved
 * its scroll position — so submitting a question produced no visible change
 * at all. The new "You" bubble and the "Thinking…" indicator both rendered
 * below the fold, the input cleared, and that was the entire feedback. The
 * request was sent and answered; the visitor could not tell. A tester who
 * knew the chat worked still concluded it had swallowed the question and
 * re-sent it.
 *
 * ## The behaviour
 *
 * - **Pinned by default.** A visitor sitting at the bottom of the transcript
 *   is following the conversation, so every new bubble, every streamed
 *   token, and the pending indicator scroll into view.
 * - **A deliberate scroll up wins.** Scrolling away from the bottom by more
 *   than {@link TRANSCRIPT_PIN_THRESHOLD_PX} unpins, and nothing auto-scrolls
 *   again until the visitor returns to the bottom. Reading an earlier answer
 *   while a new one streams is a legitimate thing to do, and yanking the
 *   viewport away from someone mid-sentence is its own bug.
 * - **Submitting re-pins.** Sending a question is an explicit "show me the
 *   answer", so `followNow()` re-pins even from a scrolled-up position —
 *   which is precisely what makes the new bubble and the indicator visible
 *   for the second and every later turn, not just the first.
 * - **`prefers-reduced-motion` is honoured**: smooth scrolling for everyone
 *   else, an instant jump for a visitor who asked for no animation.
 *
 * The threshold, rather than an exact equality, is deliberate: sub-pixel
 * layout rounding and the arrival of a streamed token both leave the
 * "bottom" a fraction of a pixel off, and an exact test would silently unpin
 * a visitor who never scrolled at all.
 */

import { type RefObject, useCallback, useEffect, useRef } from "react";

/** How far from the bottom still counts as "following the conversation", in CSS pixels. */
export const TRANSCRIPT_PIN_THRESHOLD_PX = 48;

/** Whether the visitor has asked the OS for reduced motion. Safe on a server render. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Scrolls `element` to its bottom. Uses `scrollTo` when the environment has
 * it (every browser; `happy-dom` in the unit tests does not) and falls back
 * to assigning `scrollTop`, which every DOM implementation supports.
 */
export function scrollTranscriptToBottom(element: HTMLElement): void {
  const top = element.scrollHeight;
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return;
  }
  element.scrollTop = top;
}

/** Whether `element` is scrolled close enough to its bottom to count as pinned. */
export function isPinnedToBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <= TRANSCRIPT_PIN_THRESHOLD_PX
  );
}

export interface TranscriptAutoScroll {
  /** Attach to the scrolling transcript container. */
  ref: RefObject<HTMLDivElement | null>;
  /** Attach as the container's `onScroll` — this is what notices a deliberate scroll up. */
  onScroll: () => void;
  /** Re-pin and scroll now, whatever the visitor's scroll position — call this on submit. */
  followNow: () => void;
}

/**
 * @param activityKey a value that changes whenever the transcript's rendered
 *   content or the turn's status does (message count, streamed text length,
 *   `useChat` status). The effect below re-runs on it, which is what makes
 *   the view follow a streaming answer rather than only its first token.
 */
export function useTranscriptAutoScroll(activityKey: string): TranscriptAutoScroll {
  const ref = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (element !== null) {
      pinnedRef.current = isPinnedToBottom(element);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `activityKey` is a re-run trigger, not a value this effect reads — it is the caller's summary of "the transcript changed", which is exactly when the view must follow.
  useEffect(() => {
    const element = ref.current;
    if (element !== null && pinnedRef.current) {
      scrollTranscriptToBottom(element);
    }
  }, [activityKey]);

  const followNow = useCallback(() => {
    pinnedRef.current = true;
    const element = ref.current;
    if (element !== null) {
      scrollTranscriptToBottom(element);
    }
  }, []);

  return { ref, onScroll, followNow };
}
