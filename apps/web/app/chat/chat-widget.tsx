"use client";

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
 * `useChat`'s `status` drives the loading/streaming UI: `"submitted"`
 * shows a "Thinking…" indicator, `"streaming"` renders assistant text as
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
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import type { WritingEntry } from "../../src/lib/content";
import { Button } from "../design-system/primitives/button";
import { Link } from "../design-system/primitives/link";
import { describeChatError, parseChatErrorText } from "./chat-error-messages";
import styles from "./chat-widget.module.css";
import { CitationText } from "./citation-text";
import { STARTER_PROMPTS } from "./starter-prompts";
import { useChatSessionId } from "./use-chat-session-id";

const CHAT_API = "/api/chat";

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
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { sessionId: id, messages },
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
  const parsedError = error ? parseChatErrorText(error.message) : null;
  const errorDescription = parsedError ? describeChatError(parsedError.code) : null;

  function sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || isBusy) {
      return;
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

            {status === "submitted" && <p className={styles.thinking}>Thinking…</p>}
          </div>

          {errorDescription && (
            <div className={styles.errorBanner} role="alert">
              <p className={styles.errorTitle}>{errorDescription.title}</p>
              <p>{errorDescription.description}</p>
              {errorDescription.retryable && (
                <Button type="button" variant="outline" onClick={() => regenerate()}>
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
