import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatRequestSchema } from "../../lib/chat/request-schema";
import type { WritingEntry } from "../../src/lib/content";
import { CHAT_CLIENT_TIMEOUT_MS, CHAT_SLOW_TURN_NOTICE_MS, ChatWidget } from "./chat-widget";

const NO_WRITING: readonly WritingEntry[] = [];

/** A UI message stream `Response` whose chunks are pushed under test control, so incremental rendering can be asserted deterministically instead of racing timers. */
function createControlledStreamResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function push(event: Record<string, unknown>): void {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  function done(): void {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }

  const response = new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });

  return { response, push, done };
}

async function openWidget(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /ask about marcos/i }));
}

describe("ChatWidget", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("is reachable via a launcher that does not obstruct page content, closed by default", () => {
    render(<ChatWidget writingEntries={NO_WRITING} />);
    expect(screen.getByRole("button", { name: /ask about marcos/i })).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("configures zod as jitless on import (#42), so the CSP-enforced client bundle never attempts new Function()/eval", () => {
    // `chat-widget.tsx` is imported at the top of this file, so its
    // module-level `configureZodJitless()` call has already run by the
    // time this test executes — asserted against zod's own global config
    // rather than mocking the helper, so this proves the wiring is real.
    expect(z.config().jitless).toBe(true);
  });

  it("opens the panel and shows starter prompts, including a grounded and a gap question, in the empty state", async () => {
    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);

    await openWidget(user);

    expect(
      screen.getByRole("button", { name: /what did marcos build at house numbers/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /has he worked with golang/i })).toBeInTheDocument();
  });

  it("discloses on first open that questions are recorded only as anonymized usage stats, linking the privacy note (#81)", async () => {
    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);

    await openWidget(user);

    expect(screen.getByText(/anonymi[sz]ed/i)).toBeInTheDocument();
    const privacyLink = screen.getByRole("link", { name: /privacy/i });
    expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  it("exposes the message list as a live region for streamed updates", async () => {
    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);

    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("moves focus into the panel's input when opened, for sane focus management", async () => {
    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);

    expect(screen.getByLabelText(/message/i)).toHaveFocus();
  });

  it("sends a request to /api/chat carrying the session identifier and streams assistant text incrementally, not only at completion", async () => {
    const { response, push, done } = createControlledStreamResponse();
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);

    await user.type(screen.getByLabelText(/message/i), "Hi there");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    push({ type: "start", messageId: "assistant-1" });
    push({ type: "text-start", id: "t1" });
    push({ type: "text-delta", id: "t1", delta: "Hello" });

    await screen.findByText(/Hello/);
    expect(screen.queryByText("Hello, world!")).not.toBeInTheDocument();

    push({ type: "text-delta", id: "t1", delta: ", world!" });
    push({ type: "text-end", id: "t1" });
    push({ type: "finish" });
    done();

    await screen.findByText("Hello, world!");
  });

  it("renders a citation marker as an inline, keyboard-focusable link to its site section", async () => {
    const { response, push, done } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "Tell me about House Numbers");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    push({ type: "start", messageId: "assistant-1" });
    push({ type: "text-start", id: "t1" });
    push({
      type: "text-delta",
      id: "t1",
      delta: "He worked there. [cite:experience:house-numbers]",
    });
    push({ type: "text-end", id: "t1" });
    push({ type: "finish" });
    done();

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/experience#house-numbers");
    link.focus();
    expect(link).toHaveFocus();
  });

  it("renders an unresolvable citation as plain text with no broken link", async () => {
    const { response, push, done } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "Who are you?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    push({ type: "start", messageId: "assistant-1" });
    push({ type: "text-start", id: "t1" });
    push({ type: "text-delta", id: "t1", delta: "That's me. [cite:profile:marcos]" });
    push({ type: "text-end", id: "t1" });
    push({ type: "finish" });
    done();

    await screen.findByText(/That's me\./);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["rate_limited", "Too many messages right now"],
    ["conversation_too_long", "This conversation has run long"],
    ["upstream_error", "The model provider had an error"],
  ])(
    "renders a distinct, human-readable message for the %s error code",
    async (code, expectedTitle) => {
      const { response, push } = createControlledStreamResponse();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

      const user = userEvent.setup();
      render(<ChatWidget writingEntries={NO_WRITING} />);
      await openWidget(user);
      await user.type(screen.getByLabelText(/message/i), "Hello");
      await user.click(screen.getByRole("button", { name: /^send$/i }));

      push({ type: "error", errorText: JSON.stringify({ code, message: "server said so" }) });

      await screen.findByRole("alert");
      expect(screen.getByRole("alert")).toHaveTextContent(expectedTitle);
    },
  );

  it("allows retry after a retryable error", async () => {
    const { response, push } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    push({ type: "error", errorText: JSON.stringify({ code: "upstream_error", message: "oops" }) });

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("the stop control terminates the stream and leaves the partial message visible", async () => {
    const { response, push } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    push({ type: "start", messageId: "assistant-1" });
    push({ type: "text-start", id: "t1" });
    push({ type: "text-delta", id: "t1", delta: "Partial answer" });
    await screen.findByText("Partial answer");

    await user.click(screen.getByRole("button", { name: /^stop$/i }));

    expect(screen.getByText("Partial answer")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^send$/i })).toBeInTheDocument(),
    );
  });

  it("shows a tool-step indicator while a tool call is in flight", async () => {
    const { response, push } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "What did he build?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    push({ type: "start", messageId: "assistant-1" });
    push({
      type: "tool-input-start",
      toolCallId: "call-1",
      toolName: "get-experience",
    });

    await screen.findByText(/consulting career data/i);
  });

  it("regression issue 222: the second turn's request body passes the endpoint schema even after a tool-using first turn", async () => {
    // First turn: assistant reply carries step-start + tool parts, exactly
    // what useChat replays into the next request's history — the shape
    // that used to 400 on every follow-up.
    const first = createControlledStreamResponse();
    const second = createControlledStreamResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);

    await user.type(screen.getByLabelText(/message/i), "Is Marcos available now?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    first.push({ type: "start", messageId: "assistant-1" });
    first.push({ type: "start-step" });
    first.push({ type: "tool-input-start", toolCallId: "call-1", toolName: "get-profile" });
    first.push({
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "get-profile",
      input: {},
    });
    first.push({
      type: "tool-output-available",
      toolCallId: "call-1",
      output: { location: "Colombia" },
    });
    first.push({ type: "finish-step" });
    first.push({ type: "start-step" });
    first.push({ type: "text-start", id: "t1" });
    first.push({ type: "text-delta", id: "t1", delta: "Yes, he is available." });
    first.push({ type: "text-end", id: "t1" });
    first.push({ type: "finish" });
    first.done();
    await screen.findByText("Yes, he is available.");

    // Second turn: the request body must be valid against the endpoint's
    // text-only schema — no replayed step-start/tool parts.
    await user.type(screen.getByLabelText(/message/i), "Does he know Go?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(secondInit.body as string);
    const parsed = chatRequestSchema.safeParse(body);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(
      true,
    );
    expect(body.messages).toHaveLength(3);
    const partTypes = body.messages.flatMap((m: { parts: Array<{ type: string }> }) =>
      m.parts.map((p) => p.type),
    );
    expect(new Set(partTypes)).toEqual(new Set(["text"]));
  });

  it("issue 223: keeps a visible activity indicator while streaming before any text or tool step arrives", async () => {
    const { response, push } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const user = userEvent.setup();
    render(<ChatWidget writingEntries={NO_WRITING} />);
    await openWidget(user);
    await user.type(screen.getByLabelText(/message/i), "Tell me about Marcos");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    // Submitted: indicator up.
    await screen.findByText(/thinking/i);

    // Streaming has begun (assistant message exists) but no text and no
    // in-flight tool part yet — this used to render a blank Agent bubble.
    push({ type: "start", messageId: "assistant-1" });
    push({ type: "start-step" });
    await waitFor(() => expect(screen.getByText(/thinking/i)).toBeInTheDocument());

    // Once text arrives the indicator yields to the streamed answer.
    push({ type: "text-start", id: "t1" });
    push({ type: "text-delta", id: "t1", delta: "Here is the answer." });
    await screen.findByText("Here is the answer.");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  /**
   * Starts a busy turn against a never-resolving stream under FAKE timers,
   * using `fireEvent` (synchronous) rather than `userEvent` — userEvent's
   * internal delays deadlock once timers are faked.
   */
  async function startStalledTurnWithFakeTimers(): Promise<void> {
    const { response } = createControlledStreamResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    render(<ChatWidget writingEntries={NO_WRITING} />);
    fireEvent.click(screen.getByRole("button", { name: /ask about marcos/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Stalled question" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    // Flush the send's async state updates so the busy-effect timers register.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("issue 223: shows a still-working notice on a slow turn instead of appearing dead", async () => {
    vi.useFakeTimers();
    try {
      await startStalledTurnWithFakeTimers();

      expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_SLOW_TURN_NOTICE_MS + 100);
      });
      expect(screen.getByText(/still working/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("issue 223: a turn that outlives the server's maxDuration ceiling is stopped with a friendly retryable timeout", async () => {
    vi.useFakeTimers();
    try {
      await startStalledTurnWithFakeTimers();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_CLIENT_TIMEOUT_MS + 100);
      });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/took too long/i);
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
