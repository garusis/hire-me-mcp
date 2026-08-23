// @vitest-environment node
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRateLimiters } from "../../../lib/chat/rate-limit";
import { createChatPostHandler } from "./handler";

/**
 * Chat pipeline analytics instrumentation (#79): every chat turn that
 * reaches the agent records exactly one `surface: "chat"` pipeline tool
 * event (toolName `"chat"`) and exactly one question event; every tool
 * the agent itself invokes records its own `surface: "chat"` tool event.
 * A request rejected by a guardrail before the agent runs records only
 * the pipeline event (rate_limited/invalid_input), never a question event
 * — no question was actually processed.
 */
vi.mock("../../../lib/analytics/record", () => ({
  recordChatToolEvent: vi.fn(),
  recordChatQuestionEvent: vi.fn(),
}));

const SESSION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    messages: [
      { id: "m1", role: "user", parts: [{ type: "text", text: "Does he know TypeScript?" }] },
    ],
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function alwaysAllowLimiter(): ChatRateLimiters["session"] {
  return {
    async limit() {
      return { success: true, limit: 1_000_000, remaining: 1_000_000, reset: Date.now() + 60_000 };
    },
  };
}

function alwaysDenyLimiter(): ChatRateLimiters["session"] {
  return {
    async limit() {
      return { success: false, limit: 1, remaining: 0, reset: Date.now() + 5_000 };
    },
  };
}

const USAGE = {
  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
} as const;

function stubTextModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: text },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
      ]),
    }),
  });
}

function stubToolCallingModel(
  toolName: string,
  finalText: string,
  input = "{}",
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "tool-call", toolCallId: "call-1", toolName, input },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: USAGE },
        ]),
      },
      {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: finalText },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
        ]),
      },
    ],
  });
}

function stubErroringModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("upstream boom");
    },
  });
}

async function drain(response: Response): Promise<void> {
  await response.text();
}

describe("chat pipeline analytics instrumentation (#79)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("records exactly one success pipeline event and one question event for a plain text answer", async () => {
    const { recordChatToolEvent, recordChatQuestionEvent } = await import(
      "../../../lib/analytics/record"
    );
    const model = stubTextModel("Hello.");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    await drain(response);

    const pipelineCalls = vi
      .mocked(recordChatToolEvent)
      .mock.calls.filter(([toolName]) => toolName === "chat");
    expect(pipelineCalls).toHaveLength(1);
    expect(pipelineCalls[0]?.[1]).toBe("success");

    expect(recordChatQuestionEvent).toHaveBeenCalledTimes(1);
    const [theme, , usedRetrieval] = vi.mocked(recordChatQuestionEvent).mock.calls[0] ?? [];
    expect(theme).toBe("technology");
    expect(usedRetrieval).toBe(false);
  });

  it("records a tool event for a tool the agent calls, and marks usedRetrieval when search-career is attempted", async () => {
    const { recordChatToolEvent, recordChatQuestionEvent } = await import(
      "../../../lib/analytics/record"
    );
    const model = stubToolCallingModel(
      "search-career",
      "Grounded answer.",
      JSON.stringify({ query: "typescript experience" }),
    );
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    await drain(response);

    // The real search-career tool has no DB configured in this test, so it
    // errors out rather than succeeding — the point of this test is that
    // ATTEMPTING retrieval (not just a successful one) is what sets
    // usedRetrieval, and that exactly one event is still recorded for it.
    const toolCalls = vi
      .mocked(recordChatToolEvent)
      .mock.calls.filter(([toolName]) => toolName === "search-career");
    expect(toolCalls).toHaveLength(1);

    expect(recordChatQuestionEvent).toHaveBeenCalledTimes(1);
    const [, , usedRetrieval] = vi.mocked(recordChatQuestionEvent).mock.calls[0] ?? [];
    expect(usedRetrieval).toBe(true);
  });

  it("does not mark usedRetrieval for a non-retrieval tool call", async () => {
    const { recordChatQuestionEvent } = await import("../../../lib/analytics/record");
    const model = stubToolCallingModel("get-profile", "Answer.");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    await drain(response);

    const [, , usedRetrieval] = vi.mocked(recordChatQuestionEvent).mock.calls[0] ?? [];
    expect(usedRetrieval).toBe(false);
  });

  it("records an internal_error pipeline event and no question event is skipped on a stream error", async () => {
    const { recordChatToolEvent, recordChatQuestionEvent } = await import(
      "../../../lib/analytics/record"
    );
    const model = stubErroringModel();
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    await drain(response);

    const pipelineCalls = vi
      .mocked(recordChatToolEvent)
      .mock.calls.filter(([toolName]) => toolName === "chat");
    expect(pipelineCalls).toHaveLength(1);
    expect(pipelineCalls[0]?.[1]).toBe("internal_error");
    expect(recordChatQuestionEvent).toHaveBeenCalledTimes(1);
  });

  it("records a rate_limited pipeline event and no question event when the session limit rejects the request", async () => {
    const { recordChatToolEvent, recordChatQuestionEvent } = await import(
      "../../../lib/analytics/record"
    );
    const model = stubTextModel("unused");
    const POST = createChatPostHandler({
      model,
      rateLimiters: { ip: alwaysAllowLimiter(), session: alwaysDenyLimiter() },
    });

    const response = await POST(jsonRequest(requestBody()));
    await drain(response);

    const pipelineCalls = vi
      .mocked(recordChatToolEvent)
      .mock.calls.filter(([toolName]) => toolName === "chat");
    expect(pipelineCalls).toHaveLength(1);
    expect(pipelineCalls[0]?.[1]).toBe("rate_limited");
    expect(recordChatQuestionEvent).not.toHaveBeenCalled();
  });

  it("records an invalid_input pipeline event and no question event for a malformed request body", async () => {
    const { recordChatToolEvent, recordChatQuestionEvent } = await import(
      "../../../lib/analytics/record"
    );
    const model = stubTextModel("unused");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest({ sessionId: SESSION_ID, messages: [] }));
    await drain(response);

    const pipelineCalls = vi
      .mocked(recordChatToolEvent)
      .mock.calls.filter(([toolName]) => toolName === "chat");
    expect(pipelineCalls).toHaveLength(1);
    expect(pipelineCalls[0]?.[1]).toBe("invalid_input");
    expect(recordChatQuestionEvent).not.toHaveBeenCalled();
  });
});
