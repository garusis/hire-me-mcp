import { describe, expect, it } from "vitest";
import { classifyLastUserQuestionTheme } from "./analytics";

function userMessage(text: string) {
  return { id: "m1", role: "user" as const, parts: [{ type: "text" as const, text }] };
}

describe("classifyLastUserQuestionTheme", () => {
  it("classifies the last user message's text, ignoring earlier history", () => {
    const messages = [
      userMessage("What is his hourly rate?"),
      { id: "a1", role: "assistant" as const, parts: [{ type: "text" as const, text: "..." }] },
      userMessage("Does he know TypeScript?"),
    ];

    expect(classifyLastUserQuestionTheme(messages)).toBe("technology");
  });

  it("joins multiple text parts of the last user message before classifying", () => {
    const messages = [
      {
        id: "m1",
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "Tell me about " },
          { type: "text" as const, text: "his availability" },
        ],
      },
    ];

    expect(classifyLastUserQuestionTheme(messages)).toBe("availability");
  });

  it("returns other when there is no user message at all", () => {
    expect(classifyLastUserQuestionTheme([])).toBe("other");
  });
});
