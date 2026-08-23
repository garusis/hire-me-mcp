import { describe, expect, it } from "vitest";
import { classifyQuestionTheme } from "./theme-classifier.js";

describe("classifyQuestionTheme", () => {
  it("classifies a question about work history as experience", () => {
    expect(classifyQuestionTheme("What is his experience with backend systems?")).toBe(
      "experience",
    );
    expect(classifyQuestionTheme("Tell me about his work history")).toBe("experience");
  });

  it("classifies a question about abilities as skills", () => {
    expect(classifyQuestionTheme("What are his strongest skills?")).toBe("skills");
    expect(classifyQuestionTheme("Is he proficient in system design?")).toBe("skills");
  });

  it("classifies a question about being free to work as availability", () => {
    expect(classifyQuestionTheme("Is he available to start next month?")).toBe("availability");
    expect(classifyQuestionTheme("What is his notice period?")).toBe("availability");
  });

  it("classifies a question about pay as rates", () => {
    expect(classifyQuestionTheme("What is his hourly rate?")).toBe("rates");
    expect(classifyQuestionTheme("What salary is he looking for?")).toBe("rates");
  });

  it("classifies a question naming a specific technology as technology", () => {
    expect(classifyQuestionTheme("Does he know TypeScript and React?")).toBe("technology");
    expect(classifyQuestionTheme("Has he used Kubernetes in production?")).toBe("technology");
  });

  it("falls back to other for anything that matches no keyword rule", () => {
    expect(classifyQuestionTheme("What's the weather like today?")).toBe("other");
    expect(classifyQuestionTheme("asdkjhaslkdj")).toBe("other");
    expect(classifyQuestionTheme("")).toBe("other");
  });

  it("is deterministic — the same input always yields the same theme", () => {
    const question = "What is his experience with TypeScript?";
    expect(classifyQuestionTheme(question)).toBe(classifyQuestionTheme(question));
  });

  it("is case-insensitive", () => {
    expect(classifyQuestionTheme("WHAT IS HIS HOURLY RATE?")).toBe("rates");
  });
});
