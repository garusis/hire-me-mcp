"use client";

import { useState } from "react";

/**
 * `sessionStorage` key the chat widget's session id is persisted under.
 * `sessionStorage`, not `localStorage`, is the deliberate choice: `POST
 * /api/chat` (#67) requires a client-generated session id "per visit" —
 * `sessionStorage` is scoped to the tab and cleared when it closes, which
 * matches "visit" far more closely than `localStorage`'s indefinite
 * persistence (and than a rate-limit key that should reset on a fresh
 * visit for #68's guardrails).
 */
export const CHAT_SESSION_STORAGE_KEY = "hire-me-mcp:chat-session-id";

function readStoredSessionId(): string | null {
  try {
    return sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSessionId(id: string): void {
  try {
    sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private browsing, quota) — the id still works
    // for this render, it just won't survive a remount this visit.
  }
}

function createSessionId(): string {
  const stored = readStoredSessionId();
  if (stored) {
    return stored;
  }
  const generated = crypto.randomUUID();
  persistSessionId(generated);
  return generated;
}

/**
 * A stable, per-visit session UUID for the chat widget — generated once,
 * reused across remounts within the same tab session, and sent as
 * `sessionId` on every `POST /api/chat` request.
 */
export function useChatSessionId(): string {
  const [sessionId] = useState(createSessionId);
  return sessionId;
}
