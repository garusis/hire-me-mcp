import { describe, expect, it } from "vitest";
import { AnalyticsScrubError, scrubQuestionEvent, scrubToolEvent } from "./scrubber.js";

const validToolEvent = {
  surface: "mcp" as const,
  toolName: "get-profile",
  outcome: "success" as const,
  latencyMs: 42,
};

const validQuestionEvent = {
  theme: "experience" as const,
  latencyMs: 128,
  usedRetrieval: true,
};

describe("scrubToolEvent", () => {
  it("passes through a well-formed event unchanged", () => {
    expect(scrubToolEvent(validToolEvent)).toEqual(validToolEvent);
  });

  it("rejects a surface outside the fixed taxonomy", () => {
    expect(() => scrubToolEvent({ ...validToolEvent, surface: "web" as never })).toThrow(
      AnalyticsScrubError,
    );
  });

  it("rejects an outcome outside the fixed taxonomy", () => {
    expect(() => scrubToolEvent({ ...validToolEvent, outcome: "refused" as never })).toThrow(
      AnalyticsScrubError,
    );
  });

  it("rejects a negative latency", () => {
    expect(() => scrubToolEvent({ ...validToolEvent, latencyMs: -1 })).toThrow(AnalyticsScrubError);
  });

  it("rejects raw free-text passed as the tool name", () => {
    expect(() =>
      scrubToolEvent({
        ...validToolEvent,
        toolName: "What is Marcos's experience with distributed systems and how many years?",
      }),
    ).toThrow(AnalyticsScrubError);
  });

  it("rejects an IPv4-shaped tool name", () => {
    expect(() => scrubToolEvent({ ...validToolEvent, toolName: "192.168.1.10" })).toThrow(
      AnalyticsScrubError,
    );
  });

  it("rejects an email-shaped tool name", () => {
    expect(() => scrubToolEvent({ ...validToolEvent, toolName: "someone@example.com" })).toThrow(
      AnalyticsScrubError,
    );
  });
});

describe("scrubQuestionEvent", () => {
  it("passes through a well-formed event unchanged", () => {
    expect(scrubQuestionEvent(validQuestionEvent)).toEqual(validQuestionEvent);
  });

  it("rejects raw question text passed as the theme (not one of the fixed taxonomy)", () => {
    expect(() =>
      scrubQuestionEvent({
        ...validQuestionEvent,
        theme: "What is Marcos's day rate for a 3 month contract?" as never,
      }),
    ).toThrow(AnalyticsScrubError);
  });

  it("rejects a raw contact-message-shaped theme", () => {
    expect(() =>
      scrubQuestionEvent({
        ...validQuestionEvent,
        theme: "Hi, I'd like to reach you at someone@example.com about a role" as never,
      }),
    ).toThrow(AnalyticsScrubError);
  });

  it("rejects an IP-shaped theme", () => {
    expect(() => scrubQuestionEvent({ ...validQuestionEvent, theme: "10.0.0.1" as never })).toThrow(
      AnalyticsScrubError,
    );
  });

  it("rejects a non-boolean usedRetrieval", () => {
    expect(() =>
      scrubQuestionEvent({ ...validQuestionEvent, usedRetrieval: "yes" as never }),
    ).toThrow(AnalyticsScrubError);
  });

  it("rejects a negative latency", () => {
    expect(() => scrubQuestionEvent({ ...validQuestionEvent, latencyMs: -5 })).toThrow(
      AnalyticsScrubError,
    );
  });
});
