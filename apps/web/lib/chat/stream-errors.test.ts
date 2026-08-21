import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { classifyStreamError, toStreamErrorEventText } from "./stream-errors";

function apiCallError(statusCode: number | undefined): APICallError {
  return new APICallError({
    message: "boom",
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode,
  });
}

describe("classifyStreamError", () => {
  it("classifies a 429 provider response as rate_limited", () => {
    expect(classifyStreamError(apiCallError(429)).code).toBe("rate_limited");
  });

  it("classifies a 408 provider response as timeout", () => {
    expect(classifyStreamError(apiCallError(408)).code).toBe("timeout");
  });

  it("classifies a 504 provider response as timeout", () => {
    expect(classifyStreamError(apiCallError(504)).code).toBe("timeout");
  });

  it("classifies any other provider status as upstream_error", () => {
    expect(classifyStreamError(apiCallError(500)).code).toBe("upstream_error");
  });

  it("classifies a plain Error as unknown", () => {
    expect(classifyStreamError(new Error("something else")).code).toBe("unknown");
  });

  it("classifies a non-Error thrown value as unknown", () => {
    expect(classifyStreamError("nope").code).toBe("unknown");
  });

  it("never includes the original error message text in the classified message", () => {
    const classified = classifyStreamError(apiCallError(500));
    expect(classified.message).not.toContain("boom");
  });
});

describe("toStreamErrorEventText", () => {
  it("serializes the classified error as parseable JSON carrying code and message", () => {
    const text = toStreamErrorEventText(classifyStreamError(apiCallError(429)));
    const parsed = JSON.parse(text) as { code: string; message: string };
    expect(parsed.code).toBe("rate_limited");
    expect(typeof parsed.message).toBe("string");
  });
});
