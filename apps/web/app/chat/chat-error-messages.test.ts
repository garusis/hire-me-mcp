import { describe, expect, it } from "vitest";
import { describeChatError, parseChatErrorText } from "./chat-error-messages";

describe("parseChatErrorText", () => {
  it("parses the {code, message} JSON the server's stream-errors.ts writes into the error part", () => {
    const parsed = parseChatErrorText('{"code":"rate_limited","message":"slow down"}');
    expect(parsed).toEqual({ code: "rate_limited", message: "slow down" });
  });

  it("falls back to an unknown code when the text isn't valid JSON (e.g. a raw thrown Error's message)", () => {
    const parsed = parseChatErrorText("Some raw error string, not JSON");
    expect(parsed.code).toBe("unknown");
  });

  it("falls back to an unknown code when the JSON doesn't carry a recognizable code field", () => {
    const parsed = parseChatErrorText('{"foo":"bar"}');
    expect(parsed.code).toBe("unknown");
  });

  // #73: the pre-stream 4xx guardrail responses (rate-limit-response.ts's
  // buildChatRateLimitExceededResponse, validation-response.ts's
  // buildValidationErrorResponse) both wrap the payload as
  // `{ error: { code, message } }` via error-codes.ts's buildChatErrorPayload
  // — a different shape than the mid-stream `{ code, message }` this parser
  // was originally built against. Before this fix, every guardrail 4xx
  // (session/IP rate limit, conversation-size caps, ...) fell through to the
  // "unknown"-code branch and the UI showed a generic fallback message
  // instead of the guardrail's own honest, specific one.
  it("also unwraps the nested {error:{code,message}} shape the pre-stream 4xx guardrail responses use", () => {
    const parsed = parseChatErrorText(
      '{"error":{"code":"session_rate_limited","message":"You\'ve hit the message limit for this session. Please wait and try again."}}',
    );
    expect(parsed).toEqual({
      code: "session_rate_limited",
      message: "You've hit the message limit for this session. Please wait and try again.",
    });
  });
});

describe("describeChatError", () => {
  it("renders a distinct, human-readable message for rate_limited", () => {
    const description = describeChatError("rate_limited");
    expect(description.title.length).toBeGreaterThan(0);
    expect(description.retryable).toBe(true);
  });

  it("renders a distinct, human-readable message for conversation_too_long", () => {
    // Not yet emitted by the server (#68 lands it), but the UI's map is
    // built to already recognize it generically by code rather than
    // requiring a code-by-code UI change once #68 ships.
    const description = describeChatError("conversation_too_long");
    expect(description.title.length).toBeGreaterThan(0);
  });

  it("renders a distinct, human-readable message for upstream_error", () => {
    const description = describeChatError("upstream_error");
    expect(description.title.length).toBeGreaterThan(0);
  });

  it("renders a distinct, human-readable message for timeout", () => {
    const description = describeChatError("timeout");
    expect(description.title.length).toBeGreaterThan(0);
  });

  it("each known code maps to a different message than the others", () => {
    const codes = [
      "rate_limited",
      "conversation_too_long",
      "upstream_error",
      "timeout",
      "unknown",
    ] as const;
    const titles = codes.map((code) => describeChatError(code).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("falls back to a generic, still-honest message for any code not in the known set", () => {
    const description = describeChatError("some-future-code-from-#68" as never);
    expect(description.title.length).toBeGreaterThan(0);
    expect(description.retryable).toBe(true);
  });

  // #73: these are #68's REAL guardrail codes (apps/web/lib/chat/error-codes.ts's
  // ChatErrorCode) — session_rate_limited/ip_rate_limited/message_count_exceeded/
  // etc. were never added here when #68 landed, so every one of them fell
  // through to the generic FALLBACK_ERROR_DESCRIPTION ("An unexpected error
  // occurred") in the UI instead of an honest, guardrail-specific message.
  it("renders a distinct, honest message for the session_rate_limited guardrail code", () => {
    const description = describeChatError("session_rate_limited");
    expect(description.title).not.toBe(describeChatError("unknown").title);
    expect(description.retryable).toBe(true);
  });

  it("renders a distinct, honest message for the ip_rate_limited guardrail code", () => {
    const description = describeChatError("ip_rate_limited");
    expect(description.title).not.toBe(describeChatError("unknown").title);
    expect(description.retryable).toBe(true);
  });

  it("renders a distinct, honest, non-retryable message for the conversation_size_exceeded guardrail code", () => {
    const description = describeChatError("conversation_size_exceeded");
    expect(description.title).not.toBe(describeChatError("unknown").title);
    expect(description.retryable).toBe(false);
  });

  it("renders a distinct, honest, non-retryable message for the message_count_exceeded guardrail code", () => {
    const description = describeChatError("message_count_exceeded");
    expect(description.title).not.toBe(describeChatError("unknown").title);
    expect(description.retryable).toBe(false);
  });
});
