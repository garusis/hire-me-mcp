"use client";

// Must be the very first import in this file's module-execution order —
// see `configure-zod-jitless.ts`'s own comment for exactly why. Kept
// deliberately separate from the sorted import block below (biome's import
// organizer would otherwise alphabetize it after `@ai-sdk/react`/`ai`,
// undoing the ordering this depends on) — this is a genuine exception, not
// stylistic preference; see the source-order comment there.
import "./configure-zod-jitless";

/**
 * The site's chat surface (#70): a floating, non-obstructive launcher that
 * expands into a chat panel wired to `POST /api/chat` (#67) via the AI SDK
 * v7 `useChat` React hook.
 *
 * ## Placement
 *
 * A fixed-position launcher + expandable panel, mounted once in the root
 * layout so it's reachable from every page, rather than a dedicated
 * `/chat` route. A route would need its own navigation entry and would
 * only be discoverable from pages that link to it; a global widget is
 * reachable everywhere without competing with page content — closed by
 * default, it renders as a single small button in the corner.
 *
 * ## Streaming, tool steps, errors
 *
 * `useChat`'s `status` drives the loading/streaming UI: a "Thinking…"
 * indicator stays up from `"submitted"` until the assistant shows visible
 * activity (streamed text or a tool-step indicator — issue 223: `"streaming"`
 * begins on the first stream part, long before any text, and the indicator
 * disappearing then left a blank bubble for minutes on slow tool turns),
 * `"streaming"` renders assistant text as
 * it arrives (via `message.parts`, not just the final text), and a
 * `tool-*`/`dynamic-tool` part whose `state` isn't yet `output-available`/
 * `output-error` shows a generic "Consulting career data…" step indicator
 * — generic rather than per-tool-name, so it doesn't need updating if the
 * agent's tool set (`@hire-me-mcp/agent`) changes.
 *
 * A server `error` stream part surfaces as `useChat`'s `error.message`
 * carrying the raw `errorText` `stream-errors.ts` wrote — `{ code,
 * message }` JSON. `chat-error-messages.ts` maps that to UI copy generically
 * by code, with a fallback for any code introduced later.
 *
 * ## Failure UX (issue 253)
 *
 * A turn that fails before the assistant has said anything leaves the
 * visitor's own message in the transcript with nothing under it. That used
 * to be all it left: an anonymous "You" bubble, plus one banner pinned to
 * the bottom of the panel that named neither the message it belonged to nor
 * the real cause. Sending again just added another orphan, so a few
 * failures produced a wall of ignored questions.
 *
 * Now the failure is attached to the message that failed —
 * `data-failed="true"` on that bubble, a "not sent" tag on its role label,
 * and the error text plus its actions rendered inside the bubble rather
 * than at the far end of the panel:
 *
 * - **Try again** re-sends that exact text (it does NOT `regenerate()` —
 *   there is no assistant turn to regenerate) after removing the failed
 *   bubble, so a retry replaces the message instead of appending a twin.
 * - **Edit message** takes the text back out of the transcript and returns
 *   it to the input box, so nothing the visitor typed is ever stranded.
 * - Sending a NEW question also drops the previous unanswered one. An
 *   unanswered message is not conversation history — the server never saw
 *   it — so keeping it would only rebuild the wall.
 *
 * A failure that arrives mid-stream (the assistant bubble already carries
 * partial text) is not an orphan and keeps the panel-level banner, whose
 * "Try again" still regenerates that assistant turn.
 *
 * ## Scroll follow (issue 271)
 *
 * The transcript scrolls with the conversation — see
 * `use-transcript-auto-scroll.ts` for the pinning rules, why a deliberate
 * scroll up wins, and why submitting always re-pins. Without it, the second
 * and every later question produced no visible feedback whatsoever: the new
 * bubble and the "Thinking…" indicator were rendered below the fold of a
 * viewport that never moved, so a working chat looked like a broken one.
 *
 * ## Rendered answers (issue 272)
 *
 * Answers are rendered Markdown, not `pre-wrap` source text — see
 * `chat-markdown.ts` for the subset supported, and for why it produces a
 * typed node tree rather than an HTML string.
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { StoryParentRef, WritingEntry } from "../../src/lib/content";
import { Button } from "../design-system/primitives/button";
import { Link } from "../design-system/primitives/link";
import { describeChatError, parseChatErrorText } from "./chat-error-messages";
import styles from "./chat-widget.module.css";
import { CitationSources, CitationText } from "./citation-text";
import { STARTER_PROMPTS } from "./starter-prompts";
import { toRequestMessages } from "./to-request-messages";
import { useChatSessionId } from "./use-chat-session-id";
import { useTranscriptAutoScroll } from "./use-transcript-auto-scroll";

const CHAT_API = "/api/chat";

/**
 * Slow-turn presentation thresholds (issue 223). The free-tier model behind
 * `/api/chat` can legitimately take minutes on a multi-tool turn (observed:
 * ~24s simple, ~240s two-part — documented free-tier constraint, not a bug
 * to fix here), so the client surfaces progress rather than hard-killing
 * early:
 *
 * - After {@link CHAT_SLOW_TURN_NOTICE_MS} of a busy turn, a persistent
 *   "still working" notice appears so a long wait never looks dead.
 * - After {@link CHAT_CLIENT_TIMEOUT_MS} the client stops the turn and
 *   shows a friendly, retryable timeout message. The value matches the
 *   route's `maxDuration = 300` (route.ts) — the server would be killed by
 *   Vercel at that point anyway, so anything still streaming then is
 *   genuinely stalled; timing out earlier would kill real slow-but-healthy
 *   free-tier turns (issue 169's lesson).
 */
export const CHAT_SLOW_TURN_NOTICE_MS = 15_000;
export const CHAT_CLIENT_TIMEOUT_MS = 300_000;

/**
 * issue 223 slow-turn presentation state (see the constants above): flips
 * `isSlowTurn` after {@link CHAT_SLOW_TURN_NOTICE_MS} of a continuously
 * busy turn, and after {@link CHAT_CLIENT_TIMEOUT_MS} stops the turn via
 * `stop` and flips `hasTimedOut` so the caller can show a retryable
 * timeout error. Both reset when the turn ends (`isBusy` false) — except
 * `hasTimedOut`, which the caller clears explicitly on send/retry so the
 * banner survives until the visitor acts on it.
 */
function useSlowTurnPresentation(isBusy: boolean, stop: () => void | Promise<void>) {
  const [isSlowTurn, setIsSlowTurn] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  useEffect(() => {
    if (!isBusy) {
      setIsSlowTurn(false);
      return;
    }
    const noticeTimer = setTimeout(() => setIsSlowTurn(true), CHAT_SLOW_TURN_NOTICE_MS);
    const timeoutTimer = setTimeout(() => {
      setHasTimedOut(true);
      void stop();
    }, CHAT_CLIENT_TIMEOUT_MS);
    return () => {
      clearTimeout(noticeTimer);
      clearTimeout(timeoutTimer);
      setIsSlowTurn(false);
    };
  }, [isBusy, stop]);
  const clearTimedOut = useCallback(() => setHasTimedOut(false), []);
  return { isSlowTurn, hasTimedOut, clearTimedOut };
}

/**
 * issue 223: whether the (last) assistant message is showing the visitor
 * something — streamed text or an in-flight tool-step indicator. Until it
 * does, the "Thinking…" indicator must stay up: `useChat` flips to
 * `"streaming"` on the FIRST stream part (a `step-start`, a tool call),
 * long before visible text, and dropping the indicator at that point left
 * a blank "Agent" bubble for minutes on slow tool turns.
 */
function hasVisibleAssistantActivity(lastMessage: UIMessage | undefined): boolean {
  return (
    lastMessage?.role === "assistant" &&
    (messageText(lastMessage.parts).length > 0 || lastMessage.parts.some(isInFlightToolPart))
  );
}

type MessagePart = UIMessage["parts"][number];

function isTextPart(part: MessagePart): part is Extract<MessagePart, { type: "text" }> {
  return part.type === "text";
}

function messageText(parts: readonly MessagePart[]): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join("");
}

const FINISHED_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"]);

function isInFlightToolPart(part: MessagePart): boolean {
  const isToolPart = part.type === "dynamic-tool" || part.type.startsWith("tool-");
  if (!isToolPart) {
    return false;
  }
  const state = "state" in part ? part.state : undefined;
  return typeof state !== "string" || !FINISHED_TOOL_STATES.has(state);
}

/**
 * The value `useTranscriptAutoScroll` re-runs on (issue 271): message count,
 * the length of the last message's text (so a streaming answer keeps the view
 * following it, not just its first chunk), and the turn's status.
 */
function transcriptActivityKey(messages: readonly UIMessage[], status: string): string {
  const last = messages[messages.length - 1];
  return `${messages.length}:${last === undefined ? 0 : messageText(last.parts).length}:${status}`;
}

export interface ChatWidgetProps {
  writingEntries: readonly WritingEntry[];
  /**
   * The story -> primary-experience lookup a `story` citation's href needs
   * (issue 295, epic 288) — see `citation-text.tsx`'s `CitationTextProps` for
   * why it's optional and defaults to empty.
   */
  storyParents?: readonly StoryParentRef[];
}

/** Floating launcher + expandable chat panel — see module doc for placement rationale. */
export function ChatWidget({ writingEntries, storyParents = [] }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const sessionId = useChatSessionId();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const panelId = useId();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        // issue 222: project the replayed history onto the endpoint's text-only
        // wire shape — `useChat` replays the prior assistant turn's
        // `step-start`/`tool-*` parts verbatim, which the request schema
        // rejects with HTTP 400, making every second message fail. See
        // `to-request-messages.ts` for why the fix lives at this boundary.
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { sessionId: id, messages: toRequestMessages(messages) },
        }),
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, error, clearError, stop, regenerate } =
    useChat({
      id: sessionId,
      transport,
    });

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const isBusy = status === "submitted" || status === "streaming";
  const { isSlowTurn, hasTimedOut, clearTimedOut } = useSlowTurnPresentation(isBusy, stop);

  const parsedError = error ? parseChatErrorText(error.message) : null;
  const timedOutOrParsedCode = hasTimedOut ? "timeout" : parsedError?.code;
  const errorDescription = timedOutOrParsedCode ? describeChatError(timedOutOrParsedCode) : null;

  const lastMessage = messages[messages.length - 1];
  const showThinkingIndicator = isBusy && !hasVisibleAssistantActivity(lastMessage);

  /*
   * issue 271: the transcript follows the conversation. The key changes on
   * every message added, every streamed token, and every status transition,
   * so a pinned viewport tracks a streaming answer instead of stopping at
   * its first chunk — and the "Thinking…" indicator below is in view on the
   * second and every later turn, not only the first.
   */
  const transcript = useTranscriptAutoScroll(transcriptActivityKey(messages, status));
  const { followNow } = transcript;

  /**
   * issue 253: the message this failure belongs to — the trailing "You"
   * bubble the assistant never replied to. `undefined` when the turn failed
   * mid-stream (the assistant bubble exists and carries what it managed to
   * say), which is not an orphan and keeps the panel-level banner instead.
   */
  const failedMessage =
    errorDescription !== null && lastMessage?.role === "user" ? lastMessage : undefined;

  const forgetFailedMessage = useCallback(
    (id: string) => {
      clearTimedOut();
      clearError();
      setMessages((current) => current.filter((message) => message.id !== id));
    },
    [clearError, clearTimedOut, setMessages],
  );

  const handleRetry = useCallback(() => {
    clearTimedOut();
    void regenerate();
  }, [clearTimedOut, regenerate]);

  /** Re-send the failed message's own text, replacing its bubble rather than adding a second one. */
  const handleRetryFailedMessage = useCallback(() => {
    if (failedMessage === undefined) {
      return;
    }
    const text = messageText(failedMessage.parts);
    forgetFailedMessage(failedMessage.id);
    followNow();
    sendMessage({ text });
  }, [failedMessage, followNow, forgetFailedMessage, sendMessage]);

  /** Hand the failed message's text back to the input box so it is never stranded in the transcript. */
  const handleEditFailedMessage = useCallback(() => {
    if (failedMessage === undefined) {
      return;
    }
    setInput(messageText(failedMessage.parts));
    forgetFailedMessage(failedMessage.id);
    inputRef.current?.focus();
  }, [failedMessage, forgetFailedMessage]);

  function sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || isBusy) {
      return;
    }
    clearTimedOut();
    clearError();
    // issue 271: sending is an explicit "show me the answer", so it re-pins
    // the transcript even if the visitor had scrolled up to re-read.
    followNow();
    // issue 253: the previous turn's unanswered question is dropped, not
    // stacked on top of — the server never saw it, so it is not history.
    if (failedMessage !== undefined) {
      setMessages((current) => current.filter((message) => message.id !== failedMessage.id));
    }
    sendMessage({ text: trimmed });
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    sendText(input);
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.launcher}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Close chat" : "Ask about Marcos"}
      </button>

      {isOpen && (
        <section id={panelId} className={styles.panel} aria-label="Chat with the interview agent">
          <div className={styles.header}>
            <h2 className={styles.heading}>Ask about Marcos</h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div
            ref={transcript.ref}
            onScroll={transcript.onScroll}
            className={styles.messages}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p>Ask anything about Marcos&apos;s experience, or try:</p>
                {/*
                  First-run disclosure (#81): what this chat records, in
                  one sentence, linking the full privacy note. Only shown
                  in the empty state — once a conversation is underway the
                  starter prompts and messages take priority.
                */}
                <p>
                  Questions are recorded only as anonymized usage stats (a topic label and outcome)
                  — never the raw text. See the <Link href="/privacy">privacy note</Link>.
                </p>
                <ul className={styles.starterList}>
                  {STARTER_PROMPTS.map((prompt) => (
                    <li key={prompt.id}>
                      <button
                        type="button"
                        className={styles.starterButton}
                        onClick={() => sendText(prompt.text)}
                      >
                        {prompt.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {messages.map((message) => {
              const text = messageText(message.parts);
              const hasFailed = message.id === failedMessage?.id;
              return (
                <div
                  key={message.id}
                  className={styles.message}
                  data-role={message.role}
                  // issue 253: the failing message is identifiable in the
                  // DOM, not just described by a banner somewhere else.
                  data-failed={hasFailed ? "true" : undefined}
                >
                  <span className={styles.role}>
                    {message.role === "user" ? "You" : "Agent"}
                    {hasFailed && <span className={styles.notSentTag}> · not sent</span>}
                  </span>
                  {message.parts.some(isInFlightToolPart) && (
                    <p className={styles.toolStep}>Consulting career data…</p>
                  )}
                  {/*
                    `data-chat-answer` marks the answer prose itself, apart
                    from the role label, the tool-step line, the Sources
                    list and any attached error — a stable hook for the
                    preview e2e specs, which since issue 227 have to read
                    citations out of `data-citation` attributes rather than
                    out of raw marker syntax in the text.
                  */}
                  {/*
                    A `div`, not a `p`: since issue 272 the answer is rendered
                    Markdown and may contain lists, which are invalid inside a
                    paragraph (and get reparented by the browser, breaking the
                    bubble's layout).
                  */}
                  <div className={styles.text} data-chat-answer="true">
                    <CitationText
                      text={text}
                      writingEntries={writingEntries}
                      storyParents={storyParents}
                    />
                  </div>
                  {message.role === "assistant" && (
                    <CitationSources
                      text={text}
                      writingEntries={writingEntries}
                      storyParents={storyParents}
                    />
                  )}
                  {hasFailed && errorDescription !== null && (
                    <div className={styles.messageError} role="alert">
                      <p className={styles.errorTitle}>{errorDescription.title}</p>
                      <p>{errorDescription.description}</p>
                      <div className={styles.errorActions}>
                        {errorDescription.retryable && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleRetryFailedMessage}
                          >
                            Try again
                          </Button>
                        )}
                        <Button type="button" variant="outline" onClick={handleEditFailedMessage}>
                          Edit message
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {showThinkingIndicator && (
              <p className={styles.thinking} data-chat-pending="true">
                Thinking…
              </p>
            )}
            {isBusy && isSlowTurn && (
              <p className={styles.thinking}>
                Still working — detailed answers can take a couple of minutes on this free model
                tier.
              </p>
            )}
          </div>

          {/*
            Panel-level banner only for a failure with no orphan bubble to
            attach to (issue 253) — a mid-stream error, where the assistant
            message already shows what it managed to say and "Try again"
            means regenerating that turn.
          */}
          {errorDescription && failedMessage === undefined && (
            <div className={styles.errorBanner} role="alert">
              <p className={styles.errorTitle}>{errorDescription.title}</p>
              <p>{errorDescription.description}</p>
              {errorDescription.retryable && (
                <Button type="button" variant="outline" onClick={handleRetry}>
                  Try again
                </Button>
              )}
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className="visually-hidden" htmlFor={inputId}>
              Message
            </label>
            <input
              id={inputId}
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a question…"
              disabled={isBusy}
              autoComplete="off"
            />
            {isBusy ? (
              <Button type="button" variant="outline" onClick={() => stop()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={input.trim().length === 0}>
                Send
              </Button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
