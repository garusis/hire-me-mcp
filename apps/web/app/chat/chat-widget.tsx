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
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { WritingEntry } from "../../src/lib/content";
import { Button } from "../design-system/primitives/button";
import { Link } from "../design-system/primitives/link";
import { describeChatError, parseChatErrorText } from "./chat-error-messages";
import styles from "./chat-widget.module.css";
import { CitationText } from "./citation-text";
import { STARTER_PROMPTS } from "./starter-prompts";
import { toRequestMessages } from "./to-request-messages";
import { useChatSessionId } from "./use-chat-session-id";

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

export interface ChatWidgetProps {
  writingEntries: readonly WritingEntry[];
}

/** Floating launcher + expandable chat panel — see module doc for placement rationale. */
export function ChatWidget({ writingEntries }: ChatWidgetProps) {
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

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
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

  const showThinkingIndicator =
    isBusy && !hasVisibleAssistantActivity(messages[messages.length - 1]);

  const handleRetry = useCallback(() => {
    clearTimedOut();
    void regenerate();
  }, [clearTimedOut, regenerate]);

  function sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || isBusy) {
      return;
    }
    clearTimedOut();
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

            {messages.map((message) => (
              <div key={message.id} className={styles.message} data-role={message.role}>
                <span className={styles.role}>{message.role === "user" ? "You" : "Agent"}</span>
                {message.parts.some(isInFlightToolPart) && (
                  <p className={styles.toolStep}>Consulting career data…</p>
                )}
                <p className={styles.text}>
                  <CitationText text={messageText(message.parts)} writingEntries={writingEntries} />
                </p>
              </div>
            ))}

            {showThinkingIndicator && <p className={styles.thinking}>Thinking…</p>}
            {isBusy && isSlowTurn && (
              <p className={styles.thinking}>
                Still working — detailed answers can take a couple of minutes on this free model
                tier.
              </p>
            )}
          </div>

          {errorDescription && (
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
