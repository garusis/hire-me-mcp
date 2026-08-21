import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_LOG_ALLOWED_KEYS, logChatEvent } from "./logger";

describe("logChatEvent", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits a single structured JSON line", () => {
    logChatEvent({
      event: "chat_request_completed",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      latencyMs: 42,
      stepCount: 2,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it("only ever emits an allow-listed set of keys — never a transcript body or a secret", () => {
    logChatEvent({
      event: "chat_request_failed",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      latencyMs: 10,
      errorCode: "upstream_error",
    });

    const [line] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect(CHAT_LOG_ALLOWED_KEYS).toContain(key);
    }
  });

  it("carries the fields it was given through to the JSON payload", () => {
    logChatEvent({
      event: "chat_request_completed",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      latencyMs: 123,
      stepCount: 3,
      inputTokens: 10,
      outputTokens: 20,
    });

    const [line] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("chat_request_completed");
    expect(parsed.sessionId).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
    expect(parsed.latencyMs).toBe(123);
    expect(parsed.stepCount).toBe(3);
    expect(parsed.inputTokens).toBe(10);
    expect(parsed.outputTokens).toBe(20);
  });
});
