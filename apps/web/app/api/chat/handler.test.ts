// @vitest-environment node
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChatPostHandler } from "./handler";

const SESSION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Tell me about you." }] }],
    ...overrides,
  };
}

function jsonRequest(body: unknown, init?: { signal?: AbortSignal }): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}

/** Parses `createUIMessageStreamResponse`'s SSE body (`data: {...}\n\n` lines) into its chunks. */
async function parseSseChunks(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  const chunks: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice("data:".length).trim();
    if (raw === "[DONE]" || raw === "") continue;
    chunks.push(JSON.parse(raw));
  }
  return chunks;
}

function textOf(chunks: Array<Record<string, unknown>>): string {
  return chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.delta as string)
    .join("");
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

function stubToolCallingModel(finalText: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "tool-call", toolCallId: "call-1", toolName: "get-profile", input: "{}" },
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

describe("POST /api/chat", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("streams a response whose concatenated text matches the stub model", async () => {
    const model = stubTextModel("Hello from the stub model.");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));

    expect(response.status).toBe(200);
    const chunks = await parseSseChunks(response);
    expect(textOf(chunks)).toBe("Hello from the stub model.");
  });

  it("passes through tool-call steps", async () => {
    const model = stubToolCallingModel("Grounded answer.");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    const chunks = await parseSseChunks(response);

    expect(
      chunks.some((chunk) => typeof chunk.type === "string" && chunk.type.startsWith("tool-")),
    ).toBe(true);
    expect(textOf(chunks)).toBe("Grounded answer.");
  });

  it("passes citation markers through unmodified", async () => {
    const marker = "[cite:profile:marcos-alvarez]";
    const model = stubTextModel(`Marcos is a software engineer. ${marker}`);
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    const chunks = await parseSseChunks(response);

    expect(textOf(chunks)).toContain(marker);
  });

  it("returns a 400 with a typed error payload and no stack trace for an invalid body", async () => {
    const model = stubTextModel("unused");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest({ sessionId: SESSION_ID, messages: [] }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body)).not.toMatch(/\.ts:\d+/);
  });

  it("rejects a request with no session id", async () => {
    const model = stubTextModel("unused");
    const POST = createChatPostHandler({ model });

    const { sessionId: _sessionId, ...withoutSessionId } = requestBody();
    const response = await POST(jsonRequest(withoutSessionId));

    expect(response.status).toBe(400);
  });

  it("surfaces a provider error as a typed error event on the stream, not a broken connection", async () => {
    const model = stubErroringModel();
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));

    expect(response.status).toBe(200);
    const chunks = await parseSseChunks(response);
    const errorChunk = chunks.find((chunk) => chunk.type === "error");
    expect(errorChunk).toBeDefined();
    const parsed = JSON.parse(errorChunk?.errorText as string) as { code: string; message: string };
    expect(parsed.code).toBe("unknown");
    expect(parsed.message).not.toContain("upstream boom");
  });

  it("threads the request's abort signal down to the model call — aborting the client request aborts the signal the model sees", async () => {
    // Mastra wraps the request's `AbortSignal` (composes it with its own
    // internal timeout/lifecycle signals) rather than passing the exact
    // instance straight through, so this asserts on *propagation* — the
    // signal the stub model call receives reflects the client's abort —
    // rather than reference identity.
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const model = new MockLanguageModelV4({
      doStream: async (callOptions) => {
        receivedSignal = callOptions.abortSignal;
        controller.abort();
        return {
          stream: convertArrayToReadableStream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Hello." },
            { type: "text-end", id: "t1" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
          ]),
        };
      },
    });
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody(), { signal: controller.signal }));
    await response.text();

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("logs the session id and latency without the message body", async () => {
    const model = stubTextModel("Hello from the stub model.");
    const POST = createChatPostHandler({ model });

    const response = await POST(jsonRequest(requestBody()));
    await response.text();

    const loggedLines = logSpy.mock.calls.map((call: unknown[]) => call[0] as string);
    const parsedLines = loggedLines.map(
      (line: string) => JSON.parse(line) as Record<string, unknown>,
    );
    const completion = parsedLines.find(
      (line: Record<string, unknown>) => line.event === "chat_request_completed",
    );
    expect(completion?.sessionId).toBe(SESSION_ID);
    expect(typeof completion?.latencyMs).toBe("number");
    expect(JSON.stringify(parsedLines)).not.toContain("Tell me about you");
  });
});
