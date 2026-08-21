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
});
