// @vitest-environment node
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRateLimiters } from "../../../lib/chat/rate-limit";
import { createChatPostHandler } from "./handler";

const SESSION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER_SESSION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Tell me about you." }] }],
    ...overrides,
  };
}

function jsonRequest(
  body: unknown,
  init?: { signal?: AbortSignal; ip?: string; headers?: Record<string, string> },
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...init?.headers };
  if (init?.ip) headers["x-forwarded-for"] = init.ip;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}

/**
 * A minimal, deterministic, in-memory `RateLimiter` backed by a shared
 * `Map` — the AC #68's "counters survive across handler instances" test
 * needs proof of. It stands in for the real Upstash Redis store: in
 * production, `selectChatRateLimiters` (`lib/chat/rate-limit.ts`) hands
 * back a Redis-backed limiter whose state lives in Upstash itself, entirely
 * outside any single Vercel serverless instance's memory — see that
 * module's docs. Passing the SAME instance of this fake into two separately
 * constructed `createChatPostHandler(...)` calls below proves the handler
 * reads/writes whatever store it's given rather than caching count state on
 * itself; a real deploy gets that same property for free from Redis being
 * an external process.
 */
function sharedFixedWindowLimiter(limit: number): {
  limiter: ChatRateLimiters["session"];
  counts: Map<string, number>;
} {
  const counts = new Map<string, number>();
  return {
    counts,
    limiter: {
      async limit(identifier: string) {
        const count = (counts.get(identifier) ?? 0) + 1;
        counts.set(identifier, count);
        return {
          success: count <= limit,
          limit,
          remaining: Math.max(0, limit - count),
          reset: Date.now() + 60_000,
        };
      },
    },
  };
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

/** A model that ALWAYS emits another tool call, never a final answer — the "looping stub" the per-turn step cap (#68) must halt. */
function stubLoopingToolModel(): MockLanguageModelV4 {
  let callCount = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      callCount += 1;
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: `call-${callCount}`,
            toolName: "get-profile",
            input: "{}",
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: USAGE },
        ]),
      };
    },
  });
}

/** A model whose single tool call carries input that fails `get-experience`'s strict schema (#64) — an extra, unrecognized field. */
function stubInvalidToolInputModel(finalText: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "get-experience",
            input: JSON.stringify({ unexpectedField: "not in the schema" }),
          },
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

  describe("per-session rate limiting (#68)", () => {
    it("returns 429 with the session_rate_limited code and rate-limit headers once the session limiter denies", async () => {
      const model = stubTextModel("unused");
      const POST = createChatPostHandler({
        model,
        rateLimiters: { session: alwaysDenyLimiter(), ip: alwaysAllowLimiter() },
      });

      const response = await POST(jsonRequest(requestBody()));

      expect(response.status).toBe(429);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("session_rate_limited");
      expect(response.headers.get("RateLimit-Limit")).toBe("1");
      expect(response.headers.get("Retry-After")).toBeTruthy();
    });

    it("allows a request when the session limiter reports capacity remaining", async () => {
      const model = stubTextModel("Hello.");
      const POST = createChatPostHandler({
        model,
        rateLimiters: { session: alwaysAllowLimiter(), ip: alwaysAllowLimiter() },
      });

      const response = await POST(jsonRequest(requestBody()));
      expect(response.status).toBe(200);
    });

    it("keys the session limiter by sessionId — a request over the session limit is still checked at-limit passes / over-limit fails against a fixed-window fake", async () => {
      const shared = sharedFixedWindowLimiter(2);
      const POST = createChatPostHandler({
        model: stubTextModel("Hello."),
        rateLimiters: { session: shared.limiter, ip: alwaysAllowLimiter() },
      });

      const first = await POST(jsonRequest(requestBody()));
      const second = await POST(jsonRequest(requestBody()));
      const third = await POST(jsonRequest(requestBody()));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
    });
  });

  describe("per-IP backstop rate limiting (#68)", () => {
    it("returns 429 with the ip_rate_limited code once the IP limiter denies, independent of the session limiter", async () => {
      const model = stubTextModel("unused");
      const POST = createChatPostHandler({
        model,
        rateLimiters: { session: alwaysAllowLimiter(), ip: alwaysDenyLimiter() },
      });

      const response = await POST(jsonRequest(requestBody()));

      expect(response.status).toBe(429);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("ip_rate_limited");
    });

    it("still enforces the IP limit when the client rotates its session id — the backstop is keyed by IP, not sessionId", async () => {
      const shared = sharedFixedWindowLimiter(1);
      const POST = createChatPostHandler({
        model: stubTextModel("Hello."),
        rateLimiters: { session: alwaysAllowLimiter(), ip: shared.limiter },
      });

      const first = await POST(jsonRequest(requestBody(), { ip: "203.0.113.5" }));
      const second = await POST(
        jsonRequest(requestBody({ sessionId: OTHER_SESSION_ID }), { ip: "203.0.113.5" }),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      const body = (await second.json()) as { error: { code: string } };
      expect(body.error.code).toBe("ip_rate_limited");
    });
  });

  describe("shared, non-instance-local rate-limit store (#68)", () => {
    it("counters survive across separately constructed handler instances — proves the handler reads/writes an external store, not per-instance memory", async () => {
      const shared = sharedFixedWindowLimiter(1);

      const handlerInstanceA = createChatPostHandler({
        model: stubTextModel("Hello."),
        rateLimiters: { session: shared.limiter, ip: alwaysAllowLimiter() },
      });
      const handlerInstanceB = createChatPostHandler({
        model: stubTextModel("Hello."),
        rateLimiters: { session: shared.limiter, ip: alwaysAllowLimiter() },
      });

      const fromInstanceA = await handlerInstanceA(jsonRequest(requestBody()));
      const fromInstanceB = await handlerInstanceB(jsonRequest(requestBody()));

      expect(fromInstanceA.status).toBe(200);
      // A fresh handler instance with its OWN closure still sees instance A's
      // request against the shared counter and is denied — the state lives
      // in `shared`, not in either handler's own memory.
      expect(fromInstanceB.status).toBe(429);
    });
  });

  describe("conversation caps surfaced end-to-end (#68)", () => {
    it("returns message_count_exceeded for a request over the message-count cap", async () => {
      const model = stubTextModel("unused");
      const POST = createChatPostHandler({ model });
      const tooMany = Array.from({ length: 51 }, (_, i) => ({
        id: `m${i}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hi" }],
      }));

      const response = await POST(jsonRequest(requestBody({ messages: tooMany })));

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("message_count_exceeded");
    });

    it("returns message_size_exceeded for a single text part over the per-message cap", async () => {
      const model = stubTextModel("unused");
      const POST = createChatPostHandler({ model });

      const response = await POST(
        jsonRequest(
          requestBody({
            messages: [
              { id: "m1", role: "user", parts: [{ type: "text", text: "x".repeat(8_001) }] },
            ],
          }),
        ),
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("message_size_exceeded");
    });

    it("returns conversation_size_exceeded when the conversation total exceeds the cap even though every individual message is within its own limit", async () => {
      const model = stubTextModel("unused");
      const POST = createChatPostHandler({ model });
      const messages = Array.from({ length: 6 }, (_, i) => ({
        id: `m${i}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "x".repeat(7_999) }],
      }));

      const response = await POST(jsonRequest(requestBody({ messages })));

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("conversation_size_exceeded");
    });
  });

  describe("per-turn agent step cap (#68)", () => {
    it("halts a looping tool-calling stub model — the stream ends with a step_limit_exceeded error instead of running forever", async () => {
      const model = stubLoopingToolModel();
      const POST = createChatPostHandler({ model, agentMaxSteps: 3 });

      const response = await POST(jsonRequest(requestBody()));
      const chunks = await parseSseChunks(response);

      const uniqueToolCallIds = new Set(
        chunks
          .filter((chunk) => chunk.type === "tool-input-available")
          .map((chunk) => chunk.toolCallId as string),
      );
      expect(uniqueToolCallIds.size).toBeLessThanOrEqual(3);

      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk).toBeDefined();
      const parsed = JSON.parse(errorChunk?.errorText as string) as { code: string };
      expect(parsed.code).toBe("step_limit_exceeded");
    });

    it("does not trip the step cap for a turn at exactly the limit", async () => {
      const model = stubToolCallingModel("Grounded answer.");
      const POST = createChatPostHandler({ model, agentMaxSteps: 3 });

      const response = await POST(jsonRequest(requestBody()));
      const chunks = await parseSseChunks(response);

      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk).toBeUndefined();
      expect(textOf(chunks)).toBe("Grounded answer.");
    });
  });

  describe("tool-argument rejection (#68)", () => {
    it("logs a tool_input_rejected event with the session id when a tool call's arguments fail the strict schema, without a real model call", async () => {
      const model = stubInvalidToolInputModel("Answered despite the rejected call.");
      const POST = createChatPostHandler({ model });

      const response = await POST(jsonRequest(requestBody()));
      await response.text();

      const loggedLines = logSpy.mock.calls.map((call: unknown[]) => call[0] as string);
      const parsedLines = loggedLines.map(
        (line: string) => JSON.parse(line) as Record<string, unknown>,
      );
      const rejection = parsedLines.find(
        (line: Record<string, unknown>) => line.errorCode === "tool_input_rejected",
      );
      expect(rejection).toBeDefined();
      expect(rejection?.sessionId).toBe(SESSION_ID);
    });
  });

  /**
   * #264: the scripted, model-free path the required preview gate asserts
   * against. Every test here constructs the handler with NO injected model —
   * if the scripted path were not taken, `getInterviewAgent()` would run and
   * these would fail rather than quietly making a real call.
   */
  describe("scripted preview-gate scenarios (#264)", () => {
    const SECRET = "test-automation-secret";

    beforeEach(() => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** `secret: null` omits the automation-secret header entirely. */
    function scenarioHeaders(scenario: string, secret: string | null = SECRET) {
      return {
        "x-chat-test-scenario": scenario,
        ...(secret === null ? {} : { "x-chat-test-secret": secret }),
      };
    }

    it("streams the scripted grounded answer without ever constructing the agent", async () => {
      const POST = createChatPostHandler();

      const response = await POST(
        jsonRequest(requestBody(), { headers: scenarioHeaders("grounded-citations") }),
      );
      const chunks = await parseSseChunks(response);

      expect(response.status).toBe(200);
      expect(textOf(chunks)).toContain("deterministic-chat-fixture");
      expect(textOf(chunks)).toContain("[cite:experience:");
      expect(chunks.some((chunk) => chunk.type === "tool-output-available")).toBe(true);
      expect(chunks.find((chunk) => chunk.type === "error")).toBeUndefined();
    });

    it("streams the scripted rate_limited envelope for the provider-error scenario", async () => {
      const POST = createChatPostHandler();

      const response = await POST(
        jsonRequest(requestBody(), { headers: scenarioHeaders("provider-rate-limited") }),
      );
      const chunks = await parseSseChunks(response);

      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk).toBeDefined();
      expect(JSON.parse(errorChunk?.errorText as string)).toEqual({
        code: "rate_limited",
        message:
          "The model provider is rate-limiting requests right now. Please try again shortly.",
      });
    });

    it("refuses the scenario in production — never falls through to the live model", async () => {
      vi.stubEnv("VERCEL_ENV", "production");
      const POST = createChatPostHandler();

      const response = await POST(
        jsonRequest(requestBody(), { headers: scenarioHeaders("grounded-citations") }),
      );
      const body = (await response.json()) as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    });

    it("refuses the scenario without the automation secret", async () => {
      const POST = createChatPostHandler();

      const response = await POST(
        jsonRequest(requestBody(), { headers: scenarioHeaders("grounded-citations", null) }),
      );

      expect(response.status).toBe(400);
    });

    it("still enforces the request schema on a scripted turn (#222's regression surface)", async () => {
      const POST = createChatPostHandler();

      const response = await POST(
        jsonRequest(
          requestBody({
            messages: [
              // A replayed assistant turn's `step-start` part, which
              // `app/chat/to-request-messages.ts` must strip before sending.
              { id: "m1", role: "assistant", parts: [{ type: "step-start" }] },
              { id: "m2", role: "user", parts: [{ type: "text", text: "And then?" }] },
            ],
          }),
          { headers: scenarioHeaders("grounded-citations") },
        ),
      );

      expect(response.status).toBe(400);
    });
  });
});
