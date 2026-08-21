import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_SESSION_STORAGE_KEY, useChatSessionId } from "./use-chat-session-id";

describe("useChatSessionId", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("generates a UUID-shaped session id", () => {
    const { result } = renderHook(() => useChatSessionId());
    expect(result.current).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("persists the generated id to sessionStorage so it survives a remount within the same visit", () => {
    const first = renderHook(() => useChatSessionId());
    const id = first.result.current;
    first.unmount();

    const second = renderHook(() => useChatSessionId());
    expect(second.result.current).toBe(id);
  });

  it("reuses a session id already stored from an earlier mount this visit", () => {
    sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, "11111111-1111-1111-1111-111111111111");
    const { result } = renderHook(() => useChatSessionId());
    expect(result.current).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns a stable id across re-renders of the same mounted hook instance", () => {
    const { result, rerender } = renderHook(() => useChatSessionId());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
