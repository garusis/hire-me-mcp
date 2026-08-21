import { describe, expect, it } from "vitest";
import { CHAT_MESSAGE_LIMITS, chatRequestSchema } from "./request-schema";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Tell me about you." }] }],
    ...overrides,
  };
}

describe("chatRequestSchema", () => {
  it("accepts a well-formed request body", () => {
    const result = chatRequestSchema.safeParse(validBody());
    expect(result.success).toBe(true);
  });

  it("rejects a missing sessionId", () => {
    const { sessionId: _sessionId, ...withoutSessionId } = validBody();
    const result = chatRequestSchema.safeParse(withoutSessionId);
    expect(result.success).toBe(false);
  });

  it("rejects a sessionId that is not a UUID", () => {
    const result = chatRequestSchema.safeParse(validBody({ sessionId: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("rejects an empty messages array", () => {
    const result = chatRequestSchema.safeParse(validBody({ messages: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a messages array beyond the bounded count", () => {
    const tooMany = Array.from({ length: CHAT_MESSAGE_LIMITS.maxMessages + 1 }, (_, i) => ({
      id: `m${i}`,
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    }));
    const result = chatRequestSchema.safeParse(validBody({ messages: tooMany }));
    expect(result.success).toBe(false);
  });

  it("rejects a text part beyond the bounded length", () => {
    const result = chatRequestSchema.safeParse(
      validBody({
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "x".repeat(CHAT_MESSAGE_LIMITS.maxTextLength + 1) }],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown message role", () => {
    const result = chatRequestSchema.safeParse(validBody({ messages: [{ role: "developer" }] }));
    expect(result.success).toBe(false);
  });

  it("rejects a message with no parts", () => {
    const result = chatRequestSchema.safeParse(
      validBody({ messages: [{ id: "m1", role: "user", parts: [] }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a message with no id — required so it passes through to agent.stream() as a valid UIMessage", () => {
    const result = chatRequestSchema.safeParse(
      validBody({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    );
    expect(result.success).toBe(false);
  });
});
