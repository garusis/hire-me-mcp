import { describe, expect, it } from "vitest";
import { scoreRelevance } from "./relevance.js";

describe("scoreRelevance", () => {
  it("scores an answer that addresses the question's own terms high", () => {
    const result = scoreRelevance({
      question: "What has he built with Kubernetes and Docker?",
      answer:
        "He has built and run Kubernetes and Docker in production at Rokk3r and House Numbers " +
        "[cite:skill:kubernetes] [cite:skill:docker].",
      toolCitations: [
        { entityType: "skill", entityId: "kubernetes" },
        { entityType: "skill", entityId: "docker" },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("scores an off-topic answer that ignores the interview question low", () => {
    const result = scoreRelevance({
      question: "What's your favorite pizza topping?",
      answer:
        "I can only answer questions about the candidate's professional background — ask me " +
        "about his experience, skills, or projects instead.",
      toolCitations: [],
    });

    expect(result.score).toBeLessThan(0.5);
  });

  it("scores an answer that drifts entirely off the asked question low", () => {
    const result = scoreRelevance({
      question: "What has he built with AWS Lambda?",
      answer: "He enjoys hiking and lives in Cucuta, Colombia.",
      toolCitations: [],
    });

    expect(result.score).toBeLessThan(0.3);
  });
});
