import { describe, expect, it } from "vitest";
import { buildChatErrorPayload, CHAT_ERROR_CODES, CHAT_ERROR_MESSAGES } from "./error-codes";

describe("CHAT_ERROR_CODES", () => {
  it("is a closed, deduplicated set of machine-readable codes", () => {
    const unique = new Set(CHAT_ERROR_CODES);
    expect(unique.size).toBe(CHAT_ERROR_CODES.length);
  });

  it("includes one code per guardrail this issue introduces", () => {
    for (const code of [
      "invalid_request",
      "session_rate_limited",
      "ip_rate_limited",
      "message_count_exceeded",
      "message_size_exceeded",
      "conversation_size_exceeded",
      "step_limit_exceeded",
      "tool_input_rejected",
      "rate_limited",
      "timeout",
      "upstream_error",
      "unknown",
    ]) {
      expect(CHAT_ERROR_CODES).toContain(code);
    }
  });
});

describe("CHAT_ERROR_MESSAGES", () => {
  it("has exactly one short, safe message per code", () => {
    for (const code of CHAT_ERROR_CODES) {
      const message = CHAT_ERROR_MESSAGES[code];
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThanOrEqual(200);
    }
  });

  it("never leaks internals (stack frames, file paths) in any message", () => {
    for (const message of Object.values(CHAT_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/\.ts:\d+/);
      expect(message).not.toMatch(/\/lib\//);
    }
  });
});

describe("buildChatErrorPayload", () => {
  it("builds a payload carrying the code and its documented default message", () => {
    const payload = buildChatErrorPayload("session_rate_limited");
    expect(payload).toEqual({
      error: {
        code: "session_rate_limited",
        message: CHAT_ERROR_MESSAGES.session_rate_limited,
      },
    });
  });

  it("allows overriding the message (e.g. a Zod field-level complaint for invalid_request)", () => {
    const payload = buildChatErrorPayload("invalid_request", "sessionId: must be a UUID");
    expect(payload.error.code).toBe("invalid_request");
    expect(payload.error.message).toBe("sessionId: must be a UUID");
  });
});
