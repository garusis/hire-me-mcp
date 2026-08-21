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

  it("does not penalize a wh-word ('where') the answer addresses without restating literally (#143)", () => {
    // Regression test for #143: `grounded-typescript-house-numbers` scored 0.6667 (2/3) pre-fix
    // purely because "where" — an interrogative function word carrying no topical content of its
    // own — was counted as a keyword the answer had to restate verbatim, even though the answer
    // correctly names the place (a company) instead of the literal word "where".
    const result = scoreRelevance({
      question: "What has he built with TypeScript, and where?",
      answer:
        "He built a TypeScript monorepo at House Numbers [cite:experience:house-numbers-2022-senior-full-stack-engineer].",
      toolCitations: [],
    });

    expect(result.score).toBe(1);
  });

  it("credits a plural question keyword against the answer's singular form (#143)", () => {
    // Regression test for #143: `grounded-llm-ai-agents` scored 0.6667 (2/3) pre-fix because the
    // question's "LLMs" (plural) was checked as a literal substring against an answer that only
    // ever said singular "LLM" — a real paraphrase the naive substring heuristic penalized.
    const result = scoreRelevance({
      question: "What has he built with LLMs and AI agents?",
      answer: "He built an LLM evaluation harness and a coding agent [cite:project:llm-eval].",
      toolCitations: [],
    });

    expect(result.score).toBe(1);
  });

  it("credits a verb question keyword against an inflected answer form (#143)", () => {
    // Regression test for #143: `grounded-mentoring` scored 0.5 (2/4) pre-fix — "mentored" and
    // "engineers" in the question didn't literally substring-match the answer's "mentoring" and
    // "engineer" (singular), even though the answer plainly addresses both.
    const result = scoreRelevance({
      question: "Has he mentored or onboarded other engineers?",
      answer:
        "He has done mentoring and onboarding for a new engineer on the team [cite:experience:xogito-group].",
      toolCitations: [],
    });

    expect(result.score).toBe(1);
  });

  it("still scores a genuinely off-topic redirect low even with stemming/stopword tolerance (#143)", () => {
    const result = scoreRelevance({
      question: "What's your favorite pizza topping?",
      answer:
        "I can only answer questions about the candidate's professional background — ask me " +
        "about his experience, skills, or projects instead.",
      toolCitations: [],
    });

    expect(result.score).toBe(0);
  });
});
