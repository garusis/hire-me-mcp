import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { WritingEntry } from "../../src/lib/content";
import { ChatWidget } from "./chat-widget";

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
});
